/**
 * App-specific types.
 *
 * Single source of truth for Worker bindings is `wrangler.jsonc` → generated
 * `worker-configuration.d.ts` (via `pnpm cf-typegen`). This module extends the
 * generated `Cloudflare.Env` instead of duplicating `status_db` and vars.
 *
 * Do NOT manually redeclare `status_db: D1Database` or vars already in
 * `worker-configuration.d.ts` — extend via `Cloudflare.Env` to stay drift-free.
 * `worker-configuration.d.ts` is generated and must not be hand-edited;
 * re-run `pnpm cf-typegen` after changing `wrangler.jsonc`.
 *
 * MONGODB_URI / MONGODB_DB_NAME are secrets (wrangler secret put), not vars.
 * D1 binding `status_db` has been removed — MongoDB Atlas is primary.
 */

export interface Env extends Omit<Cloudflare.Env, 'SESSION_SECRET' | 'MONGODB_URI' | 'MONGODB_DB_NAME'> {
	// Secrets injected via `wrangler secret put` / `.dev.vars` — not in wrangler.jsonc vars.
	// SESSION_SECRET is optional in type but runtime requires it — getSecret()/isAuthenticated()
	// throw fail-loud if missing to prevent weak "undefined" secret forgery.
	AUTHELIA_CLIENT_SECRET?: string;
	SESSION_SECRET?: string;
	MAILGUN_API_KEY?: string;
	DISCORD_WEBHOOK_URL?: string;
	MONGODB_URI?: string;
	MONGODB_DB_NAME?: string;
}

export interface Service {
	id: string;
	name: string;
	url: string;
	health_endpoint: string;
	method?: string;
	headers_json?: string;
	body?: string;
	token_url?: string;
	token_body?: string;
	token_response_path?: string;
	icon?: string;
}

export interface HealthCheck {
	id: string;
	service_id: string;
	status: 'up' | 'down' | 'unknown';
	status_code: number | null;
	response_snippet: string;
	latency_ms: number;
	timestamp: string;
}

export interface Incident {
	id: string;
	service_id: string | null;
	service_name?: string;
	title: string;
	message: string;
	status: 'open' | 'resolved';
	created_at: string;
	resolved_at: string | null;
}

export interface StatusChange {
	serviceName: string;
	status: 'up' | 'down';
	previousStatus: string;
	statusCode: number | null;
	responseSnippet: string | null;
	time: string;
}

export interface User {
	email: string;
	notifications_enabled: number;
	last_login: string;
}
