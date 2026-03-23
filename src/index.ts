import { renderStatusPage, renderAdminPage, renderServiceDetailPage } from './template';
// @ts-ignore
import sanitize from 'sanitize';
import * as jose from 'jose';

interface Env {
  status_db: D1Database;
  ADMIN_PASSWORD_HASH?: string;
  AUTHELIA_ISSUER: string;
  AUTHELIA_CLIENT_ID: string;
  AUTHELIA_CLIENT_SECRET: string;
  OIDC_REDIRECT_URI: string;
  SESSION_SECRET: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_FROM?: string;
  NOTIFICATION_EMAIL?: string;
}

interface Service {
  id: number;
  name: string;
  url: string;
  health_endpoint: string;
  method?: string;
  headers_json?: string;
  body?: string;
  token_url?: string;
  token_body?: string;
  token_response_path?: string;
}

async function getCachedToken(db: D1Database, service: Service): Promise<{token: string | null, error?: string}> {
  if (!service.token_url || !service.token_body) return {token: null};
  const cacheKey = `token_${service.id}`;
  
  const cached = await db.prepare('SELECT value FROM kv_cache WHERE key = ? AND expires_at > CURRENT_TIMESTAMP').bind(cacheKey).first<{value: string}>();
  if (cached) return {token: cached.value};

  try {
    const res = await fetch(service.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'StatusFlare/1.0' },
      body: service.token_body
    });
    if (!res.ok) {
      const errText = await res.text();
      return {token: null, error: `Auth API ${res.status}: ${errText.slice(0, 50)}`};
    }
    const data = await res.json() as any;
    const token = service.token_response_path ? data[service.token_response_path] : data.token;
    
    if (token) {
      await db.prepare('INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, datetime("now", "+12 hours"))')
        .bind(cacheKey, token).run();
      return {token};
    }
    return {token: null, error: 'Token not found in response JSON'};
  } catch (e: any) {
    return {token: null, error: `Auth Fetch Error: ${e.message}`};
  }
}

async function performHealthCheck(env: Env, service: Service) {
  const db = env.status_db;
  const start = Date.now();
  let status: 'up' | 'down' = 'down';
  let statusCode: number | null = null;
  let responseSnippet: string | null = null;

  // Get previous status to detect changes
  const lastCheck = await db.prepare('SELECT status FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT 1').bind(service.id).first<{status: string}>();
  const previousStatus = lastCheck ? lastCheck.status : 'unknown';

  try {
    const baseUrl = service.url.replace(/\/$/, '');
    const endpoint = service.health_endpoint.startsWith('/') ? service.health_endpoint : `/${service.health_endpoint}`;
    const fullUrl = `${baseUrl}${endpoint}`;

    let token: string | null = null;
    if (service.token_url) {
      const authResult = await getCachedToken(db, service);
      token = authResult.token;
      if (!token) {
        throw new Error(authResult.error || 'Failed to acquire auth token');
      }
    }

    const headers: Record<string, string> = { 'User-Agent': 'StatusFlare/1.0' };
    if (service.headers_json) {
      try {
        let headersStr = service.headers_json;
        if (token) {
          headersStr = headersStr.replace(/{{TOKEN}}/g, token);
        }
        const customHeaders = JSON.parse(headersStr);
        Object.assign(headers, customHeaders);
      } catch (e) {
        console.error(`[HealthCheck] Failed to parse headers for ${service.name}:`, e);
      }
    }

    const response = await fetch(fullUrl, {
      method: service.method || 'GET',
      headers,
      body: service.body || null,
      signal: AbortSignal.timeout(10000),
    });

    status = response.ok ? 'up' : 'down';
    statusCode = response.status;
    const text = await response.text();
    
    try {
      // Try to parse as JSON and format it nicely
      const json = JSON.parse(text);
      responseSnippet = JSON.stringify(json, null, 2).slice(0, 1000); // Allow larger snippet for JSON
    } catch {
      // Fallback to raw text
      responseSnippet = text.slice(0, 500);
    }
  } catch (error: any) {
    status = 'down';
    responseSnippet = error.message;
  } finally {
    const latency = Date.now() - start;
    // Store raw snippet for storage
    await db.prepare(
      'INSERT INTO health_checks (service_id, status, status_code, response_snippet, latency_ms) VALUES (?, ?, ?, ?, ?)'
    ).bind(service.id, status, statusCode, responseSnippet || '', latency).run();

    // Send email alert on status change
    if (status !== previousStatus && previousStatus !== 'unknown') {
      const subject = `[StatusFlare] ${service.name} is ${status.toUpperCase()}`;
      const text = `Service: ${service.name}\nStatus: ${status.toUpperCase()}\nPrevious Status: ${previousStatus.toUpperCase()}\nHTTP Code: ${statusCode}\nTime: ${new Date().toISOString()}\n\nDetails:\n${responseSnippet}`;
      await sendEmail(env, subject, text);
    }
  }
}

async function isAuthenticated(request: Request, env: Env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...value] = cookie.trim().split('=');
    if (name) acc[name] = value.join('=');
    return acc;
  }, {} as Record<string, string>);
  
  const sessionToken = cookies['session'];
  
  if (!sessionToken) return false;
  
  try {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);
    await jose.jwtVerify(sessionToken, secret);
    return true;
  } catch (e: any) {
    return false;
  }
}

async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(env: Env, subject: string, text: string) {
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.NOTIFICATION_EMAIL) {
    console.warn('[Email] Skipping email send: Mailgun configuration missing');
    return;
  }

  const from = env.MAILGUN_FROM || `StatusFlare <alerts@${env.MAILGUN_DOMAIN}>`;
  const formData = new URLSearchParams();
  formData.append('from', from);
  formData.append('to', env.NOTIFICATION_EMAIL);
  formData.append('subject', subject);
  formData.append('text', text);

  try {
    const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Email] Mailgun error ${res.status}: ${errText}`);
    }
  } catch (e: any) {
    console.error(`[Email] Fetch error: ${e.message}`);
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
    ctx.waitUntil(Promise.all(results.map(service => performHealthCheck(env, service))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Dynamic SVG Status Route ---
    if (path.startsWith('/badge/') && path.endsWith('.svg')) {
      const serviceName = decodeURIComponent(path.substring(7, path.length - 4));
      const width = url.searchParams.get('w') || '512';
      const height = url.searchParams.get('h') || width;

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

      return new Response(renderServiceDetailPage(service, history.results, incidents.results), {
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

      if (path === '/api/status') {
        return new Response(JSON.stringify({ services: servicesWithHistory, historicalIncidents, manualIncidents }, null, 2), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
        });
      }
      return new Response(renderStatusPage(servicesWithHistory, historicalIncidents as any[], manualIncidents as any[]), {
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
        
        await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint, method, headers_json, body, token_url, token_body, token_response_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(name, serviceUrl, endpoint, method, headersJson, body, tokenUrl, tokenBody, tokenPath).run();
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
        
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (adminPath === '/admin/incidents/resolve' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');

        const incident = await env.status_db.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.id = ?').bind(id).first<any>();
        
        await env.status_db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(id).run();

        if (incident) {
          await sendEmail(env, `[StatusFlare] RESOLVED: ${incident.title}`, `Incident "${incident.title}" for ${incident.service_name || 'System Wide'} has been resolved.\nTime: ${new Date().toISOString()}`);
        }

        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all();
      const { results: activeIncidents } = await env.status_db.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.status = "open"').all();
      
      return new Response(renderAdminPage(services as any[], activeIncidents as any[], undefined, true, oidcConfigured), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
