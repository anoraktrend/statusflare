import { renderStatusPage, renderAdminPage } from './template';

interface Env {
  status_db: D1Database;
  ADMIN_PASSWORD?: string;
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
    await db.prepare(
      'INSERT INTO health_checks (service_id, status, status_code, response_snippet, latency_ms) VALUES (?, ?, ?, ?, ?)'
    ).bind(service.id, status, statusCode, responseSnippet, latency).run();
  }
}

async function isAuthenticated(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] === env.ADMIN_PASSWORD : false;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
    ctx.waitUntil(Promise.all(results.map(service => performHealthCheck(env.status_db, service))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/api/status') {
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
        FROM health_checks h
        JOIN services s ON h.service_id = s.id
        WHERE h.status = 'down'
        ORDER BY h.timestamp DESC LIMIT 10
      `;
      const { results: incidents } = await env.status_db.prepare(incidentQuery).all();
      
      if (url.pathname === '/api/status') {
        return new Response(JSON.stringify({ services: servicesWithHistory, incidents }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(renderStatusPage(servicesWithHistory, incidents as any[]), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.pathname.startsWith('/admin')) {
      if (url.pathname === '/admin/login' && request.method === 'POST') {
        const formData = await request.formData();
        const password = formData.get('password');
        if (password === env.ADMIN_PASSWORD) {
          return new Response(null, {
            status: 302,
            headers: {
              'Location': '/admin',
              'Set-Cookie': `session=${password}; Path=/; HttpOnly; SameSite=Strict`
            }
          });
        }
        return new Response(renderAdminPage([], 'Invalid Password'), { headers: { 'Content-Type': 'text/html' } });
      }

      if (url.pathname === '/admin/logout') {
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

      if (url.pathname === '/admin/add' && request.method === 'POST') {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const serviceUrl = formData.get('url') as string;
        const endpoint = formData.get('health_endpoint') as string;
        await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint) VALUES (?, ?, ?)')
          .bind(name, serviceUrl, endpoint).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      if (url.pathname === '/admin/remove' && request.method === 'POST') {
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
