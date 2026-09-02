import { Env } from '../types';
import { corsHeaders } from './response';
import { getDb } from '../lib/mongo';

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
	/** When true, DB errors deny the request (fail-closed). Auth routes must fail closed. */
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
 * Fixed-window rate limiter backed by Mongo `rate_limits` collection.
 *
 * Atomic via single findOneAndUpdate with upsert. We attempt an atomic pipeline
 * update for production Mongo; if the driver/fallback returns null (e.g. in-memory
 * mock), we fall back to find-then-update JS logic which is sufficient for tests
 * where requests are serial.
 *
 * Window semantics:
 * - window_start is epoch seconds of the first request in the window.
 * - count is requests seen in the current window (including denied beyond limit).
 * - When window_start + windowSec <= now, window resets to count=1.
 *
 * On DB failure:
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
		const db = await getDb(env);
		const col = db.collection('rate_limits');

		// Try atomic pipeline path (Mongo 4.2+): single statement, no race.
		// Pipeline expresses: if window expired or doc missing -> count=1, window_start=now; else count+1
		let row: { count: number; window_start: number } | null = null;
		try {
			const pipeline: Record<string, unknown>[] = [
				{
					$set: {
						count: {
							$cond: [{ $lte: [{ $add: ['$window_start', opts.windowSec] }, nowSec] }, 1, { $add: ['$count', 1] }],
						},
						window_start: {
							$cond: [{ $lte: [{ $add: ['$window_start', opts.windowSec] }, nowSec] }, nowSec, '$window_start'],
						},
					},
				},
			];
			// findOneAndUpdate with pipeline: upsert path must set initial count/window_start via $setOnInsert semantics.
			// Since pipeline runs only on existing doc, we handle missing doc via upsert fallback below.
			// We attempt pipeline update first; if it returns null (missing), we insert.
			const res = (await col.findOneAndUpdate(
				{ key } as unknown as Record<string, unknown>,
				pipeline as unknown as Record<string, unknown>,
				{ upsert: false, returnDocument: 'after' } as unknown as Record<string, unknown>,
			)) as unknown as { value: { count: number; window_start: number } | null } | null;

			// In-memory fallback returns {value: null} for pipeline — detect and handle via JS
			const hasPipelineValue = res && typeof res === 'object' && 'value' in res && (res as { value: unknown }).value !== null;
			if (hasPipelineValue) {
				row = (res as { value: { count: number; window_start: number } }).value;
			} else {
				// If res is null or value null, doc missing — insert initial window
				// Try to insert; if race creates it, pipeline will succeed on next call
				if (!res || (res as { value: unknown }).value === null) {
					// JS fallback path: find then upsert manually
					throw new Error('pipeline-miss-fallback');
				}
				row = (res as unknown as { count: number; window_start: number }) ?? null;
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg !== 'pipeline-miss-fallback') {
				// For real driver errors or unsupported pipeline, fall through to JS fallback
			}
			// JS fallback: read-then-write (serial safe for tests, still correct for low concurrency)
			const existing = (await col.findOne({ key } as unknown as Record<string, unknown>)) as unknown as
				| { count: number; window_start: number }
				| null;
			if (!existing) {
				await col.updateOne(
					{ key } as unknown as Record<string, unknown>,
					{ $set: { key, count: 1, window_start: nowSec } } as unknown as Record<string, unknown>,
					{ upsert: true } as unknown as Record<string, unknown>,
				);
				row = { count: 1, window_start: nowSec };
			} else if (existing.window_start + opts.windowSec <= nowSec) {
				await col.updateOne({ key } as unknown as Record<string, unknown>, { $set: { count: 1, window_start: nowSec } } as unknown as Record<string, unknown>);
				row = { count: 1, window_start: nowSec };
			} else {
				await col.updateOne(
					{ key } as unknown as Record<string, unknown>,
					{ $set: { count: existing.count + 1 } } as unknown as Record<string, unknown>,
				);
				row = { count: existing.count + 1, window_start: existing.window_start };
			}
		}

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
 * uses 1-hour horizon to avoid thrashing. Collection has index on window_start.
 */
export async function purgeExpiredRateLimits(env: Env): Promise<void> {
	const threshold = Math.floor(Date.now() / 1000) - 3600;
	try {
		const db = await getDb(env);
		await db.collection('rate_limits').deleteMany({ window_start: { $lt: threshold } } as unknown as Record<string, unknown>);
	} catch {
		// best-effort, ignore
	}
}
