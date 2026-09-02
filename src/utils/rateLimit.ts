import { Env } from '../types';
import { corsHeaders } from './response';

/**
 * Tunable per-route limits. Override via env vars if needed — hardcoded defaults are
 * the source of truth for fresh deploys.
 */
export const RATE_LIMITS = {
	apiCheck: { limit: 10, windowSec: 60 },
	adminCallback: { limit: 20, windowSec: 60 },
	adminWrite: { limit: 30, windowSec: 60 },
	login: { limit: 5, windowSec: 300 },
} as const;

export interface RateLimitOptions {
	limit: number;
	windowSec: number;
	/** When true, D1 errors deny the request (fail-closed). Auth routes must fail closed. */
	failClosed?: boolean;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	reset: number;
	retryAfter?: number;
	limit: number;
	windowSec: number;
}

/**
 * Extract client IP from Worker request.
 * Only trusts Cloudflare's CF-Connecting-IP and request.cf.ip — X-Forwarded-For is
 * client-controlled and not trusted in production.
 */
export function extractClientIp(request: Request): string {
	const cfIp = request.headers.get('CF-Connecting-IP');
	if (cfIp) return cfIp.trim();

	// Workers runtime exposes cf.ip (not via headers) — also trustworthy.
	const cf = (request as unknown as { cf?: { ip?: string } }).cf;
	if (cf?.ip) return cf.ip;

	return 'unknown';
}

function sanitizeForKey(value: string): string {
	return value.replace(/:/g, '_').trim();
}

/**
 * Build a namespaced rate limit key. Keeps keys human-readable for debugging
 * and scoped per route + IP (+ optional user identity to prevent session sharing bypass).
 * Colon characters are sanitized to prevent key collision.
 */
export function buildRateLimitKey(prefix: string, ip: string, userId?: string): string {
	const safePrefix = sanitizeForKey(prefix);
	const safeIp = sanitizeForKey(ip);
	if (!userId) return `${safePrefix}:${safeIp}`;
	return `${safePrefix}:${safeIp}:${sanitizeForKey(userId)}`;
}

/**
 * Fixed-window rate limiter backed by D1 `rate_limits` table.
 *
 * Atomic single-statement upsert avoids TOCTOU race: concurrent requests
 * cannot both read count=9 and both succeed when limit=10.
 *
 * Window semantics:
 * - window_start is epoch seconds of the first request in the window.
 * - count is requests seen in the current window (including denied beyond limit).
 * - When window_start + windowSec <= now, window resets to count=1.
 *
 * On D1 failure:
 * - failClosed=true (auth routes) -> deny (429) to preserve brute-force protection.
 * - failClosed=false (availability-sensitive) -> allow (fail-open).
 */
export async function checkRateLimit(env: Env, key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
	if (!key) throw new Error('checkRateLimit: key must be a non-empty string');
	if (!Number.isFinite(opts.limit) || opts.limit <= 0) throw new Error('checkRateLimit: limit must be a positive number');
	if (!Number.isFinite(opts.windowSec) || opts.windowSec <= 0) throw new Error('checkRateLimit: windowSec must be a positive number');

	const nowSec = Math.floor(Date.now() / 1000);
	const resetForNewWindow = nowSec + opts.windowSec;
	const failClosed = opts.failClosed ?? false;

	try {
		// Atomic upsert: either inserts new window, resets expired window to 1,
		// or increments count. This is a single D1 statement — no read-then-write race.
		await env.status_db
			.prepare(
				`INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
				 ON CONFLICT(key) DO UPDATE SET
				   count = CASE WHEN rate_limits.window_start + ? <= ? THEN 1 ELSE rate_limits.count + 1 END,
				   window_start = CASE WHEN rate_limits.window_start + ? <= ? THEN ? ELSE rate_limits.window_start END`,
			)
			.bind(key, nowSec, opts.windowSec, nowSec, opts.windowSec, nowSec, nowSec)
			.run();

		const row = await env.status_db
			.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
			.bind(key)
			.first<{ count: number; window_start: number }>();

		if (!row) throw new Error('rate_limits row missing after upsert');

		const windowExpiresAt = row.window_start + opts.windowSec;
		const allowed = row.count <= opts.limit;

		if (!allowed) {
			return {
				allowed: false,
				remaining: 0,
				reset: windowExpiresAt,
				retryAfter: windowExpiresAt - nowSec,
				limit: opts.limit,
				windowSec: opts.windowSec,
			};
		}

		return {
			allowed: true,
			remaining: opts.limit - row.count,
			reset: windowExpiresAt,
			limit: opts.limit,
			windowSec: opts.windowSec,
		};
	} catch {
		if (failClosed) {
			return {
				allowed: false,
				remaining: 0,
				reset: resetForNewWindow,
				retryAfter: opts.windowSec,
				limit: opts.limit,
				windowSec: opts.windowSec,
			};
		}
		// Fail open for availability-sensitive routes (e.g., apiCheck)
		return {
			allowed: true,
			remaining: opts.limit,
			reset: resetForNewWindow,
			limit: opts.limit,
			windowSec: opts.windowSec,
		};
	}
}

/**
 * Canonical rate limit headers for 2xx and 429 responses.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
	const headers: Record<string, string> = {
		'X-RateLimit-Limit': String(result.limit),
		'X-RateLimit-Remaining': String(result.remaining),
		'X-RateLimit-Reset': String(result.reset),
	};
	if (!result.allowed && result.retryAfter !== undefined) {
		headers['Retry-After'] = String(result.retryAfter);
	}
	return headers;
}

/**
 * 429 response helper. Returns JSON to stay consistent across both API and admin
 * HTML endpoints — callers can render it or follow the Retry-After header.
 * Includes CORS headers for cross-origin fetch.
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
	const headers = getRateLimitHeaders(result);
	// Ensure Retry-After is always present on 429
	if (!headers['Retry-After']) headers['Retry-After'] = String(result.retryAfter ?? result.windowSec);

	return new Response(JSON.stringify({ error: 'Too Many Requests', retryAfter: result.retryAfter ?? result.windowSec }), {
		status: 429,
		headers: {
			...corsHeaders(),
			...headers,
			'Content-Type': 'application/json',
		},
	});
}

/**
 * Best-effort purge of expired windows. Safe to call from scheduled handler.
 * Threshold aligns with largest configured window (login 300s) plus buffer;
 * uses 1-hour horizon to avoid thrashing. Table has index on window_start.
 */
export async function purgeExpiredRateLimits(env: Env): Promise<void> {
	const threshold = Math.floor(Date.now() / 1000) - 3600;
	try {
		await env.status_db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(threshold).run();
	} catch {
		// best-effort, ignore
	}
}
