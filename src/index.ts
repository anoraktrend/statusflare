import { renderStatusPage } from './pages/StatusPage';
import { renderAdminPage } from './pages/AdminPage';
import { renderServiceDetailPage } from './pages/ServiceDetailPage';
import { Env, Service } from './types';
import { isAuthenticated, hashPassword } from './utils/auth';
import { performHealthCheck } from './services/checker';
import { sendEmail, sendDiscordNotification } from './utils/notifications';
import { svgToPng } from './utils/image';
// @ts-ignore
import sanitize from 'sanitize';
import * as jose from 'jose';

let cachedWasm: ArrayBuffer | null = null;

async function getBadgeStatus(env: Env, serviceName: string): Promise<string> {
  let status = 'unknown';

  if (serviceName.toLowerCase() === 'all' || serviceName.toLowerCase() === 'global') {
    const query = `
      SELECT status FROM health_checks 
      WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY service_id)
    `;
    const { results } = await env.status_db.prepare(query).all<{status: string}>();
    if (results.length > 0) {
      status = results.every(r => r.status === 'up') ? 'up' : 'down';
    }
  } else {
    const query = `
      SELECT s.name, h.status
      FROM services s
      LEFT JOIN (
        SELECT service_id, status
        FROM health_checks
        WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY service_id)
      ) h ON s.id = h.service_id
      WHERE LOWER(s.name) = LOWER(?) OR LOWER(s.name) LIKE LOWER(?)
      LIMIT 1
    `;
    const result = await env.status_db.prepare(query).bind(serviceName, `%${serviceName}%`).first() as any;
    status = result ? result.status : 'unknown';
  }
  return status;
}

function generateBadgeSvg(status: string, width: string, height: string): string {
  const SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="{{WIDTH}}" height="{{HEIGHT}}" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g>
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:11.8631;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="250.06845" ry="250.06844" />
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:41.994;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="204.00301" ry="204.00299" />
    <ellipse style="fill:{{COLOR}};fill-opacity:1;stroke:{{COLOR}};stroke-width:7.50716;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="256" rx="158.24641" ry="158.24643" />
  </g>
</svg>`;
  const color = status === 'up' ? '#007c00' : (status === 'down' ? '#f80008' : '#6c7485');
  return SVG_TEMPLATE.replace(/{{COLOR}}/g, color).replace(/{{WIDTH}}/g, width).replace(/{{HEIGHT}}/g, height);
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
    ctx.waitUntil(Promise.all(results.map(service => performHealthCheck(env, service))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Dynamic Badge Routes ---
    if (path.startsWith('/badge/') && (path.endsWith('.svg') || path.endsWith('.png'))) {
      const isPng = path.endsWith('.png');
      const serviceName = decodeURIComponent(path.substring(7, path.length - (isPng ? 4 : 4)));
      const width = url.searchParams.get('w') || '512';
      const height = url.searchParams.get('h') || width;

      const status = await getBadgeStatus(env, serviceName);
      const svg = generateBadgeSvg(status, width, height);

      if (isPng) {
        try {
          if (!cachedWasm) {
            const wasmRes = await env.ASSETS.fetch(new URL('/resvg.wasm', request.url));
            if (!wasmRes.ok) throw new Error('Failed to fetch resvg.wasm');
            cachedWasm = await wasmRes.arrayBuffer();
          }
          const png = await svgToPng(svg, parseInt(width), parseInt(height), cachedWasm);
          return new Response(png as any, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=60',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (e: any) {
          return new Response(`Error generating PNG: ${e.message}`, { status: 500 });
        }
      }

      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (path === '/api/check') {
      const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
      await Promise.all(results.map(service => performHealthCheck(env, service)));
      return new Response('Health check triggered and saved to D1', {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // --- Service Detail Route ---
    if (path.startsWith('/status/')) {
      const serviceName = decodeURIComponent(path.substring(8));
      const service = await env.status_db.prepare('SELECT * FROM services WHERE name = ?').bind(serviceName).first<Service>();
      
      if (!service) {
        return new Response('Service Not Found', { status: 404 });
      }

      const history = await env.status_db.prepare(
        'SELECT * FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT 50'
      ).bind(service.id).all();

      const incidents = await env.status_db.prepare(
        'SELECT * FROM incidents WHERE service_id = ? AND status = "open" ORDER BY created_at DESC'
      ).bind(service.id).all();

      return new Response(renderServiceDetailPage(service, history.results as any[], incidents.results as any[]), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (path === '/' || path === '/api/status') {
      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
      const historyQuery = `
        SELECT * FROM (
          SELECT service_id, status, latency_ms, status_code, response_snippet, timestamp,
          ROW_NUMBER() OVER(PARTITION BY service_id ORDER BY timestamp DESC) as rn
          FROM health_checks
        ) WHERE rn <= 30
      `;
      const { results: history } = await env.status_db.prepare(historyQuery).all();
      const servicesWithHistory = services.map(s => {
        const sHistory = history.filter((h: any) => h.service_id === s.id);
        return {
          ...s,
          history: sHistory,
          latest: sHistory[0] || { status: 'unknown', timestamp: new Date().toISOString() }
        };
      });

      const historicalOutageQuery = `
        SELECT s.name, h.status_code, h.response_snippet, h.timestamp
        FROM health_checks h JOIN services s ON h.service_id = s.id
        WHERE h.status = 'down' ORDER BY h.timestamp DESC LIMIT 10
      `;
      const { results: historicalIncidents } = await env.status_db.prepare(historicalOutageQuery).all();

      const manualIncidentQuery = `
        SELECT i.*, s.name as service_name
        FROM incidents i
        LEFT JOIN services s ON i.service_id = s.id
        WHERE i.status = 'open'
        ORDER BY i.created_at DESC
      `;
      const { results: manualIncidents } = await env.status_db.prepare(manualIncidentQuery).all();

      const systemHistoryQuery = `
        SELECT 
          strftime('%Y-%m-%d %H:%M', timestamp) as timestamp,
          CASE 
            WHEN MIN(status) = 'up' AND MAX(status) = 'up' THEN 'up'
            WHEN MIN(status) = 'down' AND MAX(status) = 'down' THEN 'down'
            ELSE 'degraded'
          END as status,
          CAST(AVG(latency_ms) AS INTEGER) as latency_ms
        FROM health_checks
        GROUP BY strftime('%Y-%m-%d %H:%M', timestamp)
        ORDER BY timestamp DESC
        LIMIT 30
      `;
      const { results: systemHistory } = await env.status_db.prepare(systemHistoryQuery).all();

      const uptimeQuery = `
        SELECT 
          CAST(SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as uptime
        FROM health_checks
      `;
      const { results: uptimeResult } = await env.status_db.prepare(uptimeQuery).all<{uptime: number}>();
      const systemUptime = uptimeResult[0]?.uptime ? uptimeResult[0].uptime.toFixed(2) : '100.00';

      if (path === '/api/status') {
        return new Response(JSON.stringify({ services: servicesWithHistory, historicalIncidents, manualIncidents, system: { history: systemHistory, uptime: systemUptime } }, null, 2), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
        });
      }
      return new Response(renderStatusPage(servicesWithHistory, historicalIncidents as any[], manualIncidents as any[], { history: systemHistory as any[], uptime: systemUptime }), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (path === '/admin/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Bad Request', { status: 400 });

      const tokenRes = await fetch(`${env.AUTHELIA_ISSUER}/api/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.OIDC_REDIRECT_URI,
          client_id: env.AUTHELIA_CLIENT_ID,
          client_secret: env.AUTHELIA_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        return new Response(`Token exchange failed: ${errorText}`, { status: 500 });
      }
      
      const tokens = await tokenRes.json() as any;
      
      const secret = new TextEncoder().encode(env.SESSION_SECRET);
      const sessionJwt = await new jose.SignJWT({ sub: tokens.sub || 'admins' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(secret);

      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/admin',
          'Set-Cookie': `session=${sessionJwt}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=7200`
        }
      });
    }

    if (path.startsWith('/admin')) {
      const adminPath = path.replace(/\/$/, '');
      const oidcConfigured = !!(env.AUTHELIA_ISSUER && env.AUTHELIA_CLIENT_ID);

      if (adminPath === '/admin/login' && request.method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password') as string;
        if (env.ADMIN_PASSWORD_HASH) {
          const enteredHash = await hashPassword(password);
          if (enteredHash === env.ADMIN_PASSWORD_HASH) {
            const secret = new TextEncoder().encode(env.SESSION_SECRET);
            const sessionJwt = await new jose.SignJWT({ sub: 'admin' })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt()
              .setExpirationTime('1h')
              .sign(secret);
            return new Response(null, {
              status: 302,
              headers: { 'Location': '/admin', 'Set-Cookie': `session=${sessionJwt}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600` }
            });
          }
        }
        return new Response(renderAdminPage([], [], 'Invalid Password', false, oidcConfigured), { headers: { 'Content-Type': 'text/html' } });
      }

      if (adminPath === '/admin/login/oidc') {
        const authUrl = `${env.AUTHELIA_ISSUER}/api/oidc/authorization?` + new URLSearchParams({
          client_id: env.AUTHELIA_CLIENT_ID,
          response_type: 'code',
          scope: 'openid profile email',
          redirect_uri: env.OIDC_REDIRECT_URI,
          state: crypto.randomUUID(),
        });
        return new Response(null, { status: 302, headers: { 'Location': authUrl } });
      }

      if (adminPath === '/admin/logout') {
        return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' } });
      }

      if (!await isAuthenticated(request, env)) {
        return new Response(renderAdminPage([], [], undefined, false, oidcConfigured), { headers: { 'Content-Type': 'text/html' } });
      }

      if (adminPath === '/admin/add' && request.method === 'POST') {
        const formData = await request.formData();
        const name = sanitize.value(formData.get('name') as string, 'string');
        const serviceUrl = sanitize.value(formData.get('url') as string, 'string');
        const endpoint = sanitize.value(formData.get('health_endpoint') as string, 'string');
        const method = sanitize.value(formData.get('method') as string, 'string') || 'GET';
        const headersJson = sanitize.value(formData.get('headers_json') as string, 'string') || null;
        const body = sanitize.value(formData.get('body') as string, 'string') || null;
        const tokenUrl = sanitize.value(formData.get('token_url') as string, 'string') || null;
        const tokenBody = sanitize.value(formData.get('token_body') as string, 'string') || null;
        const tokenPath = sanitize.value(formData.get('token_response_path') as string, 'string') || null;
        const icon = sanitize.value(formData.get('icon') as string, 'string') || null;
        
        await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint, method, headers_json, body, token_url, token_body, token_response_path, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(name, serviceUrl, endpoint, method, headersJson, body, tokenUrl, tokenBody, tokenPath, icon).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/remove' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');
        await env.status_db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/incidents/create' && request.method === 'POST') {
        const formData = await request.formData();
        const title = sanitize.value(formData.get('title') as string, 'string');
        const message = sanitize.value(formData.get('message') as string, 'string');
        const service_id = formData.get('service_id') || null;
        
        await env.status_db.prepare('INSERT INTO incidents (title, message, service_id) VALUES (?, ?, ?)')
          .bind(title, message, service_id).run();

        let serviceName = 'System Wide';
        if (service_id) {
          const service = await env.status_db.prepare('SELECT name FROM services WHERE id = ?').bind(service_id).first<{name: string}>();
          if (service) serviceName = service.name;
        }

        await sendEmail(env, `[StatusFlare] NEW INCIDENT: ${title}`, `Incident: ${title}\nAffected Service: ${serviceName}\nMessage: ${message}\nTime: ${new Date().toISOString()}`);
        await sendDiscordNotification(env, `🚨 NEW INCIDENT: ${title}`, `**Affected Service:** ${serviceName}\n**Message:** ${message}`, 0xFEE75C);
        
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/incidents/resolve' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');

        const incident = await env.status_db.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.id = ?').bind(id).first<any>();
        
        await env.status_db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(id).run();

        if (incident) {
          const subject = `[StatusFlare] RESOLVED: ${incident.title}`;
          const text = `Incident "${incident.title}" for ${incident.service_name || 'System Wide'} has been resolved.\nTime: ${new Date().toISOString()}`;
          await sendEmail(env, subject, text);
          await sendDiscordNotification(env, `✅ RESOLVED: ${incident.title}`, `The incident for **${incident.service_name || 'System Wide'}** has been resolved.`, 0x57F287);
        }

        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
      const { results: activeIncidents } = await env.status_db.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.status = "open"').all<any>();
      
      return new Response(renderAdminPage(services, activeIncidents, undefined, true, oidcConfigured), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
