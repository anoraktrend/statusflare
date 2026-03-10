import { renderStatusPage, renderAdminPage } from './template';
// @ts-ignore
import sanitize from 'sanitize';

interface Env {
  status_db: D1Database;
  ADMIN_PASSWORD_HASH?: string;
}

interface Service {
  id: number;
  name: string;
  url: string;
  health_endpoint: string;
}

async function performHealthCheck(db: D1Database, service: Service) {
  const start = Date.now();
  let status: 'up' | 'down' = 'down';
  let statusCode: number | null = null;
  let responseSnippet: string | null = null;

  try {
    const baseUrl = service.url.replace(/\/$/, '');
    const endpoint = service.health_endpoint.startsWith('/') ? service.health_endpoint : `/${service.health_endpoint}`;
    const fullUrl = `${baseUrl}${endpoint}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'StatusFlare/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    status = response.ok ? 'up' : 'down';
    statusCode = response.status;
    const text = await response.text();
    responseSnippet = text.slice(0, 200);
  } catch (error: any) {
    status = 'down';
    responseSnippet = error.message;
  } finally {
    const latency = Date.now() - start;
    const sanitizedSnippet = sanitize.value(responseSnippet || '', 'string');
    await db.prepare(
      'INSERT INTO health_checks (service_id, status, status_code, response_snippet, latency_ms) VALUES (?, ?, ?, ?, ?)'
    ).bind(service.id, status, statusCode, sanitizedSnippet, latency).run();
  }
}

async function isAuthenticated(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;
  return cookie.includes('session=true');
}

async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
    ctx.waitUntil(Promise.all(results.map(service => performHealthCheck(env.status_db, service))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Dynamic SVG Status Route ---
    if (path.startsWith('/badge/') && path.endsWith('.svg')) {
      const serviceName = decodeURIComponent(path.substring(7, path.length - 4));
      const width = url.searchParams.get('w') || '512';
      const height = url.searchParams.get('h') || width;

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
      const status = result ? result.status : 'unknown';
      
      // Need a way to call the function from template.ts or inline it. 
      // For now, we'll inline the logic since we already have it in src/index.ts
      const SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="{{WIDTH}}" height="{{HEIGHT}}" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g>
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:11.8631;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="250.06845" ry="250.06844" />
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:41.994;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="204.00301" ry="204.00299" />
    <ellipse style="fill:{{COLOR}};fill-opacity:1;stroke:{{COLOR}};stroke-width:7.50716;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="256" rx="158.24641" ry="158.24643" />
  </g>
</svg>`;
      const color = status === 'up' ? '#007c00' : (status === 'down' ? '#f80008' : '#6c7485');
      const rendered = SVG_TEMPLATE.replace(/{{COLOR}}/g, color).replace(/{{WIDTH}}/g, width).replace(/{{HEIGHT}}/g, height);

      return new Response(rendered, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
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

      if (path === '/api/status') {
        return new Response(JSON.stringify({ services: servicesWithHistory, historicalIncidents, manualIncidents }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(renderStatusPage(servicesWithHistory, historicalIncidents as any[], manualIncidents as any[]), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (path.startsWith('/admin')) {
      const adminPath = path.replace(/\/$/, '');

      if (adminPath === '/admin/login' && request.method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password') as string;
        if (!env.ADMIN_PASSWORD_HASH) return new Response('Server Error', { status: 500 });
        const enteredHash = await hashPassword(password);
        if (enteredHash === env.ADMIN_PASSWORD_HASH) {
          return new Response(null, {
            status: 302,
            headers: { 'Location': '/admin', 'Set-Cookie': 'session=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600' }
          });
        }
        return new Response(renderAdminPage([], []), { headers: { 'Content-Type': 'text/html' } });
      }

      if (adminPath === '/admin/logout') {
        return new Response(null, { status: 302, headers: { 'Location': '/admin', 'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' } });
      }

      if (!await isAuthenticated(request, env)) {
        return new Response(renderAdminPage([], []), { headers: { 'Content-Type': 'text/html' } });
      }

      // --- Admin Protected Actions ---
      if (adminPath === '/admin/add' && request.method === 'POST') {
        const formData = await request.formData();
        const name = sanitize.value(formData.get('name') as string, 'string');
        const serviceUrl = sanitize.value(formData.get('url') as string, 'string');
        const endpoint = sanitize.value(formData.get('health_endpoint') as string, 'string');
        await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint) VALUES (?, ?, ?)')
          .bind(name, serviceUrl, endpoint).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/remove' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');
        await env.status_db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      // --- Manual Incident Management ---
      if (adminPath === '/admin/incidents/create' && request.method === 'POST') {
        const formData = await request.formData();
        const title = sanitize.value(formData.get('title') as string, 'string');
        const message = sanitize.value(formData.get('message') as string, 'string');
        const service_id = formData.get('service_id') || null;
        await env.status_db.prepare('INSERT INTO incidents (title, message, service_id) VALUES (?, ?, ?)')
          .bind(title, message, service_id).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/incidents/resolve' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');
        await env.status_db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(id).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all();
      const { results: activeIncidents } = await env.status_db.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.status = "open"').all();
      
      return new Response(renderAdminPage(services as any[], activeIncidents as any[], undefined, true), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
