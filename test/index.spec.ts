import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { clearMongoCollections, seedMongoService, seedHealthCheck } from './helpers';

describe('status-worker', () => {
	beforeAll(async () => {
		// Mongo in-memory — clear any leftover from previous runs
		await clearMongoCollections(env as unknown as Record<string, unknown>);

		// Insert a test service via Mongo (bypasses D1 schema)
		const svcId = await seedMongoService(env as unknown as Record<string, unknown>, {
			name: 'Test Service',
			url: 'http://example.com',
			health_endpoint: '/health',
		});

		// Insert a health check result
		await seedHealthCheck(env as unknown as Record<string, unknown>, svcId, { status: 'up', status_code: 200, latency_ms: 45 });
	});

	it('returns HTML for GET /', async () => {
		const request = new Request('http://example.com/');
		const response = await SELF.fetch(request as any);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/html');
		const text = await response.text();
		expect(text).toContain('Test Service');
	});

	it('returns JSON for GET /api/status', async () => {
		const request = new Request('http://example.com/api/status');
		const response = await SELF.fetch(request as any);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		const data = (await response.json()) as unknown as { services: { name: string; latest: { status: string } }[] };
		expect(data.services).toBeDefined();
		expect(data.services.length).toBeGreaterThan(0);
		expect(data.services[0].name).toBe('Test Service');
		expect(data.services[0].latest.status).toBe('up');
	});

	it('returns an SVG badge for GET /badge/Test%20Service.svg', async () => {
		const request = new Request('http://example.com/badge/Test%20Service.svg');
		const response = await SELF.fetch(request as any);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
		const text = await response.text();
		expect(text).toContain('<svg');
		expect(text).toContain('#007c00'); // Green color for 'up' status
	});

	it('returns a PNG badge for GET /badge/Test%20Service.png', async () => {
		const request = new Request('http://example.com/badge/Test%20Service.png');
		const response = await SELF.fetch(request as any);
		if (response.status === 500) {
			console.error(await response.text());
		}
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('image/png');
		const buffer = await response.arrayBuffer();
		expect(buffer.byteLength).toBeGreaterThan(0);
	});

	it('returns 404 for unknown routes', async () => {
		const request = new Request('http://example.com/unknown');
		const response = await SELF.fetch(request as any);
		expect(response.status).toBe(404);
	});
});
