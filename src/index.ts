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
    // Using sanitize.value from the package
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
      const incidentQuery = `
        SELECT s.name, h.status_code, h.response_snippet, h.timestamp
        FROM health_checks h JOIN services s ON h.service_id = s.id
        WHERE h.status = 'down' ORDER BY h.timestamp DESC LIMIT 10
      `;
      const { results: incidents } = await env.status_db.prepare(incidentQuery).all();
      if (path === '/api/status') {
        return new Response(JSON.stringify({ services: servicesWithHistory, incidents }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(renderStatusPage(servicesWithHistory, incidents as any[]), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (path.startsWith('/admin')) {
      const adminPath = path.replace(/\/$/, '');

      if (adminPath === '/admin/login' && request.method === 'POST') {
        try {
          const formData = await request.formData();
          const password = formData.get('password') as string;
          
          if (!env.ADMIN_PASSWORD_HASH) {
            return new Response(renderAdminPage([], 'Server Error: ADMIN_PASSWORD_HASH not configured'), { headers: { 'Content-Type': 'text/html' } });
          }

          const enteredHash = await hashPassword(password);
          if (enteredHash === env.ADMIN_PASSWORD_HASH) {
            return new Response(null, {
              status: 302,
              headers: {
                'Location': '/admin',
                'Set-Cookie': 'session=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600'
              }
            });
          }
          return new Response(renderAdminPage([], 'Invalid Password'), { headers: { 'Content-Type': 'text/html' } });
        } catch (e: any) {
          return new Response(renderAdminPage([], 'Error processing login: ' + e.message), { headers: { 'Content-Type': 'text/html' } });
        }
      }

      if (adminPath === '/admin/logout') {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/admin',
            'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
          }
        });
      }

      if (!await isAuthenticated(request, env)) {
        return new Response(renderAdminPage([]), { headers: { 'Content-Type': 'text/html' } });
      }

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

      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all();
      return new Response(renderAdminPage(services as any[], undefined, true), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
