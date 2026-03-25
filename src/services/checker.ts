import { Env, Service, StatusChange } from '../types';

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

export async function performHealthCheck(env: Env, service: Service): Promise<StatusChange | null> {
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

    // Send alerts on status change
    if (status !== previousStatus && previousStatus !== 'unknown') {
      return {
        serviceName: service.name,
        status,
        previousStatus,
        statusCode,
        responseSnippet,
        time: new Date().toISOString()
      };
    }
    return null;
  }
}
