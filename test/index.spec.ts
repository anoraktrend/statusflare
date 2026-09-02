import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import schemaSql from '../schema.sql?raw';
import { statementsFromSchema } from './helpers';

describe('status-worker', () => {
	beforeAll(async () => {
		// Single source of truth: schema.sql (consolidated view of migrations).
		const statements = statementsFromSchema(schemaSql);
		for (const stmt of statements) {
			await env.status_db.prepare(stmt).run();
		}

		// Insert a test service
		await env.status_db.prepare('INSERT INTO services (name, url, health_endpoint) VALUES (?, ?, ?)').bind('Test Service', 'http://example.com', '/health').run();

		// Insert a health check result
		await env.status_db.prepare('INSERT INTO health_checks (service_id, status, status_code, latency_ms) VALUES (?, ?, ?, ?)').bind(1, 'up', 200, 45).run();
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
		const data = (await response.json()) as any;
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
