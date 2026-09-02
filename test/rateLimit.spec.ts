import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { checkRateLimit } from '../src/utils/rateLimit';
import { clearMongoCollections, seedMongoService, seedHealthCheck } from './helpers';

describe('rate limiting', () => {
	beforeAll(async () => {
		await clearMongoCollections(env as unknown as Record<string, unknown>);
		const svcId = await seedMongoService(env as unknown as Record<string, unknown>, {
			name: 'Test Service',
			url: 'http://example.com',
			health_endpoint: '/health',
		});
		await seedHealthCheck(env as unknown as Record<string, unknown>, svcId);
	});

	it('returns 429 after exceeding /api/check limit and includes rate limit headers', async () => {
		const ip = '10.0.0.1';
		// limit is 10 per 60s — 10 should succeed, 11th should be 429
		for (let i = 0; i < 10; i++) {
			const res = await SELF.fetch(new Request('http://example.com/api/check', { headers: { 'CF-Connecting-IP': ip } }) as any);
			expect(res.status).not.toBe(429);
			expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
			expect(res.headers.get('X-RateLimit-Remaining')).not.toBeNull();
			expect(res.headers.get('X-RateLimit-Reset')).not.toBeNull();
		}
		const limited = await SELF.fetch(new Request('http://example.com/api/check', { headers: { 'CF-Connecting-IP': ip } }) as any);
		expect(limited.status).toBe(429);
		expect(limited.headers.get('Retry-After')).not.toBeNull();
		expect(limited.headers.get('X-RateLimit-Limit')).toBe('10');
		expect(limited.headers.get('X-RateLimit-Remaining')).toBe('0');
		const body = (await limited.json()) as unknown as { error: string };
		expect(body.error).toMatch(/Too Many/i);
	});

	it('does not rate limit non-write GET routes', async () => {
		const ip = '10.0.0.2';
		for (let i = 0; i < 15; i++) {
			const res = await SELF.fetch(new Request('http://example.com/', { headers: { 'CF-Connecting-IP': ip } }) as any);
			expect(res.status).toBe(200);
		}
		const api = await SELF.fetch(new Request('http://example.com/api/health', { headers: { 'CF-Connecting-IP': ip } }) as any);
		expect(api.status).not.toBe(429);
		const badge = await SELF.fetch(
			new Request('http://example.com/badge/Test%20Service.svg', { headers: { 'CF-Connecting-IP': ip } }) as any,
		);
		expect(badge.status).not.toBe(429);
	});

	it('rate limits POST /admin/login (brute-force protection)', async () => {
		const ip = '10.0.0.3';
		for (let i = 0; i < 5; i++) {
			const res = await SELF.fetch(
				new Request('http://example.com/admin/login', {
					method: 'POST',
					headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/x-www-form-urlencoded' },
					body: 'password=wrong',
				}) as any,
			);
			expect(res.status).not.toBe(429);
		}
		const limited = await SELF.fetch(
			new Request('http://example.com/admin/login', {
				method: 'POST',
				headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/x-www-form-urlencoded' },
				body: 'password=wrong',
			}) as any,
		);
		expect(limited.status).toBe(429);
		expect(limited.headers.get('Retry-After')).not.toBeNull();
	});

	it('checkRateLimit utility enforces fixed window and window reset', async () => {
		const key = `test:unit:${Date.now()}:${Math.random()}`;
		const opts = { limit: 3, windowSec: 60 };
		const r1 = await checkRateLimit(env as unknown as import('../src/types').Env, key, opts);
		expect(r1.allowed).toBe(true);
		expect(r1.remaining).toBe(2);
		const r2 = await checkRateLimit(env as unknown as import('../src/types').Env, key, opts);
		expect(r2.allowed).toBe(true);
		expect(r2.remaining).toBe(1);
		const r3 = await checkRateLimit(env as unknown as import('../src/types').Env, key, opts);
		expect(r3.allowed).toBe(true);
		expect(r3.remaining).toBe(0);
		const r4 = await checkRateLimit(env as unknown as import('../src/types').Env, key, opts);
		expect(r4.allowed).toBe(false);
		expect(r4.remaining).toBe(0);
		expect(r4.retryAfter).toBeGreaterThan(0);
		expect(r4.retryAfter).toBeLessThanOrEqual(60);
	});

	it('X-RateLimit headers are present on successful write check', async () => {
		const ip = '10.0.0.4';
		const res = await SELF.fetch(new Request('http://example.com/api/check', { headers: { 'CF-Connecting-IP': ip } }) as any);
		expect(res.headers.get('X-RateLimit-Limit')).toBeTruthy();
		expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy();
		expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
	});
});
