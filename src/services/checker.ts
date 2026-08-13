import { Env, Service, StatusChange } from '../types';
import { err } from '../utils/helpers';

const SNIPPET_LIMIT = 1024;
const SNIPPET_PRETTY_LIMIT = 1000;
const SNIPPET_RAW_LIMIT = 500;
const CHECK_TIMEOUT_MS = 10000;

export interface CheckOutcome {
	change: StatusChange | null;
	insert: D1PreparedStatement;
}

async function getCachedToken(db: D1Database, service: Service): Promise<{ token: string | null; error?: string }> {
	if (!service.token_url || !service.token_body) return { token: null };
	const cacheKey = `token_${service.id}`;

	const cached = await db
		.prepare('SELECT value FROM kv_cache WHERE key = ? AND expires_at > CURRENT_TIMESTAMP')
		.bind(cacheKey)
		.first<{ value: string }>();
	if (cached) return { token: cached.value };

	try {
		const res = await fetch(service.token_url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'User-Agent': 'StatusFlare/1.0' },
			body: service.token_body,
		});
		if (!res.ok) {
			const errText = await res.text();
			return { token: null, error: `Auth API ${res.status}: ${errText.slice(0, 50)}` };
		}
		const data = (await res.json()) as Record<string, string | undefined>;
		const token = service.token_response_path ? data[service.token_response_path] : data.token;

		if (token) {
			await db
				.prepare('INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, datetime("now", "+12 hours"))')
				.bind(cacheKey, token)
				.run();
			return { token };
		}
		return { token: null, error: 'Token not found in response JSON' };
	} catch (e) {
		return { token: null, error: `Auth Fetch Error: ${err(e)}` };
	}
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((acc, p) => acc + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

/**
 * Reads at most SNIPPET_LIMIT bytes from the response body so large payloads
 * are not fully buffered. Preference is preserved: JSON bodies are
 * pretty-printed when fully read, otherwise raw text is returned.
 */
export async function captureResponseSnippet(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) {
		const text = await response.text();
		return text.slice(0, SNIPPET_RAW_LIMIT);
	}

	const parts: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	try {
		while (total < SNIPPET_LIMIT) {
			const { done, value } = await reader.read();
			if (done) break;
			parts.push(value);
			total += value.length;
		}
		if (total >= SNIPPET_LIMIT) {
			truncated = true;
			await reader.cancel();
		}
	} catch (e) {
		return err(e);
	} finally {
		reader.releaseLock();
	}

	const text = new TextDecoder().decode(concatBytes(parts));
	if (!truncated) {
		try {
			const json = JSON.parse(text);
			return JSON.stringify(json, null, 2).slice(0, SNIPPET_PRETTY_LIMIT);
		} catch {
			// Not JSON, fall through to raw text
		}
	}
	return text.slice(0, SNIPPET_RAW_LIMIT);
}

export async function performHealthCheck(env: Env, service: Service, previousStatus: string): Promise<CheckOutcome> {
	const db = env.status_db;
	const start = Date.now();
	let status: 'up' | 'down' = 'down';
	let statusCode: number | null = null;
	let responseSnippet: string | null = null;

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
				const customHeaders = JSON.parse(headersStr) as Record<string, string>;
				Object.assign(headers, customHeaders);
			} catch (e) {
				console.error(`[HealthCheck] Failed to parse headers for ${service.name}:`, err(e));
			}
		}

		const response = await fetch(fullUrl, {
			method: service.method || 'GET',
			headers,
			body: service.body || null,
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
		});

		status = response.ok ? 'up' : 'down';
		statusCode = response.status;
		responseSnippet = await captureResponseSnippet(response);
	} catch (e) {
		status = 'down';
		responseSnippet = err(e);
	}

	const latency = Date.now() - start;
	const insert = db
		.prepare('INSERT INTO health_checks (service_id, status, status_code, response_snippet, latency_ms) VALUES (?, ?, ?, ?, ?)')
		.bind(service.id, status, statusCode, responseSnippet || '', latency);

	let change: StatusChange | null = null;
	if (status !== previousStatus && previousStatus !== 'unknown') {
		change = {
			serviceName: service.name,
			status,
			previousStatus,
			statusCode,
			responseSnippet,
			time: new Date().toISOString(),
		};
	}

	return { change, insert };
}