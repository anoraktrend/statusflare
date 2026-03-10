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
      signal: AbortSignal.timeout(10000), // 10s timeout
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
    )
    .bind(service.id, status, statusCode, responseSnippet, latency)
    .run();
  }
}

async function isAuthenticated(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return false;
  // In a real app, use a proper session store or JWT. 
  // For simplicity, we compare a signed token or just the password hash.
  return match[1] === env.ADMIN_PASSWORD;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { results } = await env.status_db.prepare('SELECT * FROM services').all<Service>();
    ctx.waitUntil(Promise.all(results.map(service => performHealthCheck(env.status_db, service))));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // --- Public Routes ---
    if (url.pathname === '/') {
      const statusQuery = `
        SELECT s.name, s.url, h.status, h.latency_ms, h.status_code, h.timestamp
        FROM services s
        LEFT JOIN (
          SELECT service_id, status, latency_ms, status_code, timestamp
          FROM health_checks
          WHERE id IN (SELECT MAX(id) FROM health_checks GROUP BY service_id)
        ) h ON s.id = h.service_id
      `;
      const { results: serviceStatuses } = await env.status_db.prepare(statusQuery).all();
      const incidentQuery = `
        SELECT s.name, h.status_code, h.response_snippet, h.timestamp
        FROM health_checks h
        JOIN services s ON h.service_id = s.id
        WHERE h.status = 'down'
        ORDER BY h.timestamp DESC LIMIT 10
      `;
      const { results: incidents } = await env.status_db.prepare(incidentQuery).all();
      return new Response(renderStatusPage(serviceStatuses as any[], incidents as any[]), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.pathname === '/api/status') {
        const { results: serviceStatuses } = await env.status_db.prepare('SELECT * FROM services').all();
        return new Response(JSON.stringify(serviceStatuses), { headers: { 'Content-Type': 'application/json' } });
    }

    // --- Admin Routes ---
    if (url.pathname.startsWith('/admin')) {
      // 1. Handle Login POST
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

      // 2. Handle Logout
      if (url.pathname === '/admin/logout') {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/admin',
            'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
          }
        });
      }

      // 3. Auth Guard for all other /admin routes
      if (!await isAuthenticated(request, env)) {
        return new Response(renderAdminPage([]), { headers: { 'Content-Type': 'text/html' } });
      }

      // 4. Handle Add Service
      if (url.pathname === '/admin/add' && request.method === 'POST') {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const serviceUrl = formData.get('url') as string;
        const endpoint = formData.get('health_endpoint') as string;

        await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint) VALUES (?, ?, ?)')
          .bind(name, serviceUrl, endpoint)
          .run();
        
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      // 5. Handle Remove Service
      if (url.pathname === '/admin/remove' && request.method === 'POST') {
        const formData = await request.formData();
        const id = formData.get('id');
        await env.status_db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
        return new Response(null, { status: 302, headers: { 'Location': '/admin' } });
      }

      // 6. Render Admin Dashboard
      const { results: services } = await env.status_db.prepare('SELECT * FROM services').all();
      return new Response(renderAdminPage(services as any[], undefined, true), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
