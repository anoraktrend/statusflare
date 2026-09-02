/**
 * App-specific types.
 *
 * Single source of truth for Worker bindings is `wrangler.jsonc` → generated
 * `worker-configuration.d.ts` (via `pnpm cf-typegen`). This module extends the
 * generated `Cloudflare.Env` instead of duplicating `status_db` and vars.
 * Only secrets not stored in `wrangler.jsonc` vars are augmented here.
 *
 * Do NOT manually redeclare `status_db: D1Database` or vars already in
 * `worker-configuration.d.ts` — extend via `Cloudflare.Env` to stay drift-free.
 * `worker-configuration.d.ts` is generated and must not be hand-edited;
 * re-run `pnpm cf-typegen` after changing `wrangler.jsonc`.
 *
 * Widening literal types: Cloudflare.Env may contain string literal vars (e.g.
 * ADMIN_PASSWORD_HASH: "fb4e..." literal). If strict literal causes friction in
 * tests/mocks, widen via `Omit<Cloudflare.Env, 'ADMIN_PASSWORD_HASH'> &
 * { ADMIN_PASSWORD_HASH: string }`. Currently left as-is — run cf-typegen to
 * regenerate when wrangler.jsonc changes.
 */
export interface Env extends Omit<Cloudflare.Env, 'SESSION_SECRET'> {
	// Secrets injected via `wrangler secret put` / `.dev.vars` — not in wrangler.jsonc vars.
	// SESSION_SECRET is optional in type but runtime requires it — getSecret()/isAuthenticated()
	// throw fail-loud if missing to prevent weak "undefined" secret forgery.
	AUTHELIA_CLIENT_SECRET?: string;
	SESSION_SECRET?: string;
	MAILGUN_API_KEY?: string;
	DISCORD_WEBHOOK_URL?: string;
}

export interface Service {
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
	icon?: string;
}

export interface HealthCheck {
	id: number;
	service_id: number;
	status: 'up' | 'down' | 'unknown';
	status_code: number | null;
	response_snippet: string;
	latency_ms: number;
	timestamp: string;
}

export interface Incident {
	id: number;
	service_id: number | null;
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
