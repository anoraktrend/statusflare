import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';

describe('status-worker', () => {
	beforeAll(async () => {
		// Initialize the D1 database
		const statements = [
			`CREATE TABLE IF NOT EXISTS services (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				url TEXT NOT NULL,
				health_endpoint TEXT NOT NULL,
				method TEXT DEFAULT 'GET',
				headers_json TEXT,
				body TEXT,
				token_url TEXT,
				token_body TEXT,
				token_response_path TEXT
			)`,
			`CREATE TABLE IF NOT EXISTS kv_cache (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				expires_at DATETIME NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS health_checks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				service_id INTEGER NOT NULL,
				status TEXT NOT NULL,
				status_code INTEGER,
				response_snippet TEXT,
				latency_ms INTEGER,
				timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (service_id) REFERENCES services(id)
			)`,
			`CREATE TABLE IF NOT EXISTS incidents (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				service_id INTEGER,
				title TEXT NOT NULL,
				message TEXT NOT NULL,
				status TEXT DEFAULT 'open',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				resolved_at DATETIME,
				FOREIGN KEY (service_id) REFERENCES services(id)
			)`
		];
		
		for (const stmt of statements) {
			await env.status_db.prepare(stmt).run();
		}
		
		// Insert a test service
		await env.status_db.prepare(
			'INSERT INTO services (name, url, health_endpoint) VALUES (?, ?, ?)'
		).bind('Test Service', 'http://example.com', '/health').run();
		
		// Insert a health check result
		await env.status_db.prepare(
			'INSERT INTO health_checks (service_id, status, status_code, latency_ms) VALUES (?, ?, ?, ?)'
		).bind(1, 'up', 200, 45).run();
	});

	it('returns HTML for GET /', async () => {
		const request = new Request('http://example.com/');
		const response = await SELF.fetch(request);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/html');
		const text = await response.text();
		expect(text).toContain('Test Service');
	});

	it('returns JSON for GET /api/status', async () => {
		const request = new Request('http://example.com/api/status');
		const response = await SELF.fetch(request);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		const data = await response.json() as any;
		expect(data.services).toBeDefined();
		expect(data.services.length).toBeGreaterThan(0);
		expect(data.services[0].name).toBe('Test Service');
		expect(data.services[0].latest.status).toBe('up');
	});

	it('returns an SVG badge for GET /badge/Test%20Service.svg', async () => {
		const request = new Request('http://example.com/badge/Test%20Service.svg');
		const response = await SELF.fetch(request);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
		const text = await response.text();
		expect(text).toContain('<svg');
		expect(text).toContain('#007c00'); // Green color for 'up' status
	});

	it('returns 404 for unknown routes', async () => {
		const request = new Request('http://example.com/unknown');
		const response = await SELF.fetch(request);
		expect(response.status).toBe(404);
	});
});
