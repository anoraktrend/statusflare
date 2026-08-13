import { Env, Service, Incident, HealthCheck, User, StatusChange } from '../types';
import { performHealthCheck, CheckOutcome } from './checker';

const CRON_LOCK_KEY = 'cron_lock';
const CRON_LOCK_SECONDS = 55;
const D1_BATCH_LIMIT = 50;

function chunkBy<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
	return chunks;
}

export function getAllServices(env: Env) {
	return env.status_db.prepare('SELECT * FROM services').all<Service>();
}

export function getServiceByName(env: Env, name: string) {
	return env.status_db.prepare('SELECT * FROM services WHERE name = ?').bind(name).first<Service>();
}

export function getServiceHealthHistory(env: Env, serviceId: number, limit = 50) {
	return env.status_db
		.prepare('SELECT * FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT ?')
		.bind(serviceId, limit)
		.all<HealthCheck>();
}

export function getServiceIncidents(env: Env, serviceId: number) {
	return env.status_db
		.prepare('SELECT * FROM incidents WHERE service_id = ? AND status = "open" ORDER BY created_at DESC')
		.bind(serviceId)
		.all<Incident>();
}

export async function getServicesWithRecentHistory(env: Env) {
	const { results: services } = await getAllServices(env);
	if (services.length === 0) return [];
	const ids = services.map((s) => s.id);
	const placeholders = ids.map(() => '?').join(',');

	const { results: history } = await env.status_db
		.prepare(`
      SELECT service_id, status, latency_ms, status_code, response_snippet, timestamp
      FROM health_checks
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER(PARTITION BY service_id ORDER BY timestamp DESC) as rn
          FROM health_checks
          WHERE timestamp >= datetime('now', '-1 day')
        ) WHERE rn <= 30
      )
        AND service_id IN (${placeholders})
      ORDER BY timestamp DESC
    `)
		.bind(...ids)
		.all<{ service_id: number; status: string; timestamp: string; latency_ms: number; status_code: number | null; response_snippet: string }>();

	const historyByService = new Map<number, typeof history>();
	for (const h of history) {
		const list = historyByService.get(h.service_id);
		if (list) list.push(h);
		else historyByService.set(h.service_id, [h]);
	}

	return services.map((s) => {
		const sHistory = historyByService.get(s.id) || [];
		return {
			...s,
			history: sHistory,
			latest: sHistory[0] || { status: 'unknown', timestamp: new Date().toISOString() },
		};
	});
}

export function getHistoricalOutages(env: Env) {
	return env.status_db
		.prepare(`
      SELECT s.name, h.status_code, h.response_snippet, h.timestamp
      FROM health_checks h JOIN services s ON h.service_id = s.id
      WHERE h.status = 'down' ORDER BY h.timestamp DESC LIMIT 10
    `)
		.all<{ name: string; status_code: number; response_snippet: string; timestamp: string }>();
}

export function getActiveIncidents(env: Env) {
	return env.status_db
		.prepare(`
      SELECT i.*, s.name as service_name
      FROM incidents i LEFT JOIN services s ON i.service_id = s.id
      WHERE i.status = 'open' ORDER BY i.created_at DESC
    `)
		.all<Incident>();
}

export function getSystemHistory(env: Env) {
	return env.status_db
		.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:%M', timestamp) as timestamp,
        CASE 
          WHEN MIN(status) = 'up' AND MAX(status) = 'up' THEN 'up'
          WHEN MIN(status) = 'down' AND MAX(status) = 'down' THEN 'down'
          ELSE 'degraded'
        END as status,
        CAST(AVG(latency_ms) AS INTEGER) as latency_ms
      FROM health_checks
      WHERE timestamp >= datetime('now', '-2 hours')
      GROUP BY strftime('%Y-%m-%d %H:%M', timestamp)
      ORDER BY timestamp DESC LIMIT 30
    `)
		.all<{ timestamp: string; status: string; latency_ms: number }>();
}

export async function getSystemUptime(env: Env): Promise<string> {
	const { results } = await env.status_db
		.prepare(`
      SELECT CAST(SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) * 100 as uptime
      FROM health_checks
      WHERE timestamp >= datetime('now', '-90 days')
    `)
		.all<{ uptime: number }>();
	return results[0]?.uptime ? results[0].uptime.toFixed(2) : '100.00';
}

async function getLatestStatusByService(env: Env): Promise<Map<number, string>> {
	const { results } = await env.status_db
		.prepare(
			'SELECT h.service_id, h.status FROM health_checks h JOIN (SELECT MAX(id) as id FROM health_checks GROUP BY service_id) latest ON h.id = latest.id',
		)
		.all<{ service_id: number; status: string }>();
	return new Map(results.map((r) => [r.service_id, r.status]));
}

/**
 * Prevents overlapping cron invocations (and concurrent /api/check calls)
 * from double-checking services and double-writing to D1.
 */
async function acquireCheckLock(env: Env): Promise<boolean> {
	const row = await env.status_db
		.prepare('SELECT expires_at FROM kv_cache WHERE key = ?')
		.bind(CRON_LOCK_KEY)
		.first<{ expires_at: string }>();
	if (row && new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() > Date.now()) return true;

	await env.status_db
		.prepare('INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, datetime("now", ?))')
		.bind(CRON_LOCK_KEY, new Date().toISOString(), `+${CRON_LOCK_SECONDS} seconds`)
		.run();
	return false;
}

export async function performAllHealthChecks(env: Env): Promise<StatusChange[]> {
	const { results: services } = await getAllServices(env);
	if (services.length === 0) return [];

	// A previous run is still in progress (checks took > 55s); skip this one.
	if (await acquireCheckLock(env)) return [];

	// Single query for every service's previous status, then run checks in parallel.
	const latest = await getLatestStatusByService(env);
	const outcomes = await Promise.all(services.map((s) => performHealthCheck(env, s, latest.get(s.id) ?? 'unknown')));

	// All inserts go out in a handful of batched round-trips instead of one per service.
	for (const chunk of chunkBy(outcomes.map((o) => o.insert), D1_BATCH_LIMIT)) {
		await env.status_db.batch(chunk);
	}

	return outcomes.filter((o): o is CheckOutcome & { change: StatusChange } => o.change !== null).map((o) => o.change);
}

export async function cleanupOldHealthChecks(env: Env, keepDays = 90) {
	await env.status_db.prepare('DELETE FROM health_checks WHERE timestamp < datetime("now", ?)').bind(`-${keepDays} days`).run();
}

export function getUserByEmail(env: Env, email: string) {
	return env.status_db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
}

export function registerUser(env: Env, email: string) {
	return env.status_db
		.prepare("INSERT INTO users (email, last_login) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET last_login = CURRENT_TIMESTAMP")
		.bind(email)
		.run();
}

export function updateNotificationPref(env: Env, email: string, enabled: number) {
	return env.status_db
		.prepare("UPDATE users SET notifications_enabled = ? WHERE email = ?")
		.bind(enabled, email)
		.run();
}

export function addService(env: Env, data: Record<string, string | null>) {
	return env.status_db
		.prepare(
			'INSERT INTO services (name, url, health_endpoint, method, headers_json, body, token_url, token_body, token_response_path, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		)
		.bind(data.name, data.url, data.health_endpoint, data.method, data.headers_json, data.body, data.token_url, data.token_body, data.token_response_path, data.icon)
		.run();
}

export async function removeService(env: Env, id: string | number) {
	await env.status_db.batch([
		env.status_db.prepare('DELETE FROM health_checks WHERE service_id = ?').bind(id),
		env.status_db.prepare('DELETE FROM incidents WHERE service_id = ?').bind(id),
		env.status_db.prepare('DELETE FROM services WHERE id = ?').bind(id),
	]);
}

export function createIncident(env: Env, title: string, message: string, service_id: string | null) {
	return env.status_db
		.prepare('INSERT INTO incidents (title, message, service_id) VALUES (?, ?, ?)')
		.bind(title, message, service_id)
		.run();
}

export function getIncidentWithService(env: Env, id: string | number) {
	return env.status_db
		.prepare('SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id WHERE i.id = ?')
		.bind(id)
		.first<{ title: string; service_name: string | null }>();
}

export function resolveIncident(env: Env, id: string | number) {
	return env.status_db
		.prepare("UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
		.bind(id)
		.run();
}

export function getServiceName(env: Env, id: string | number) {
	return env.status_db.prepare('SELECT name FROM services WHERE id = ?').bind(id).first<{ name: string }>();
}
