import { Env, Service, Incident, HealthCheck, User, StatusChange } from '../types';
import { performHealthCheck, CheckOutcome } from './checker';
import { getDb } from '../lib/mongo';
import { SimpleObjectId, toObjectId } from '../lib/objectId';

const CRON_LOCK_KEY = 'cron_lock';
const CRON_LOCK_SECONDS = 55;

// ---------------------------------------------------------------------------
// Helpers: Doc -> Typed model + ObjectId conversions
// ---------------------------------------------------------------------------

function toSid(value: string | number | SimpleObjectId | null | undefined): SimpleObjectId | null {
	if (value === null || value === undefined) return null;
	if (value instanceof SimpleObjectId) return value;
	if (typeof value === 'string' && SimpleObjectId.isValid(value)) return new SimpleObjectId(value);
	// numeric D1 id or non-hex string — not convertible; return null so caller can handle fallback
	return null;
}

function idFilter(id: string | number | SimpleObjectId): Record<string, unknown> {
	if (typeof id === 'string' && SimpleObjectId.isValid(id)) return { _id: new SimpleObjectId(id) };
	if (typeof id === 'object' && id !== null && id instanceof SimpleObjectId) return { _id: id };
	// fallback: allow direct string match (defensive)
	return { _id: id as unknown } as unknown as Record<string, unknown>;
}

function serviceIdFilter(serviceId: string | number): Record<string, unknown> {
	const oid = toSid(serviceId as string);
	if (oid) return { service_id: oid };
	return { service_id: serviceId } as unknown as Record<string, unknown>;
}

function docToService(doc: Record<string, unknown>): Service {
	const oid = doc._id as SimpleObjectId | string;
	const hex = oid instanceof SimpleObjectId ? oid.toHexString() : String(oid);
	return {
		id: hex,
		name: String(doc.name ?? ''),
		url: String(doc.url ?? ''),
		health_endpoint: String(doc.health_endpoint ?? ''),
		method: doc.method ? String(doc.method) : undefined,
		headers_json: doc.headers_json ? String(doc.headers_json) : undefined,
		body: doc.body ? String(doc.body) : undefined,
		token_url: doc.token_url ? String(doc.token_url) : undefined,
		token_body: doc.token_body ? String(doc.token_body) : undefined,
		token_response_path: doc.token_response_path ? String(doc.token_response_path) : undefined,
		icon: doc.icon ? String(doc.icon) : undefined,
	};
}

function toIsoString(v: unknown): string {
	if (v instanceof Date) return v.toISOString();
	if (typeof v === 'string') return v;
	if (v === null || v === undefined) return new Date().toISOString();
	return String(v);
}

function docToHealthCheck(doc: Record<string, unknown>): HealthCheck {
	const oid = doc._id as SimpleObjectId | string;
	const sid = doc.service_id as SimpleObjectId | string;
	return {
		id: oid instanceof SimpleObjectId ? oid.toHexString() : String(oid),
		service_id: sid instanceof SimpleObjectId ? sid.toHexString() : String(sid),
		status: (doc.status as HealthCheck['status']) ?? 'unknown',
		status_code: (doc.status_code as number | null) ?? null,
		response_snippet: String(doc.response_snippet ?? ''),
		latency_ms: Number(doc.latency_ms ?? 0),
		timestamp: toIsoString(doc.timestamp),
	};
}

function docToIncident(doc: Record<string, unknown>): Incident {
	const oid = doc._id as SimpleObjectId | string;
	const sid = doc.service_id as SimpleObjectId | string | null | undefined;
	return {
		id: oid instanceof SimpleObjectId ? oid.toHexString() : String(oid),
		service_id: sid instanceof SimpleObjectId ? sid.toHexString() : sid != null ? String(sid) : null,
		title: String(doc.title ?? ''),
		message: String(doc.message ?? ''),
		status: (doc.status as Incident['status']) ?? 'open',
		created_at: toIsoString(doc.created_at ?? doc.timestamp),
		resolved_at: doc.resolved_at ? toIsoString(doc.resolved_at) : null,
	};
}

function docToUser(doc: Record<string, unknown>): User {
	return {
		email: String(doc.email ?? doc._id ?? ''),
		notifications_enabled: Number(doc.notifications_enabled ?? 1),
		last_login: toIsoString(doc.last_login),
	};
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function getAllServices(env: Env): Promise<{ results: Service[] }> {
	const db = await getDb(env);
	const docs = await db.collection('services').find({}).toArray();
	return { results: docs.map((d: Record<string, unknown>) => docToService(d)) };
}

export async function getServiceByName(env: Env, name: string): Promise<Service | null> {
	if (!name) return null;
	const db = await getDb(env);
	const doc = await db.collection('services').findOne({ name } as Record<string, unknown>);
	return doc ? docToService(doc as Record<string, unknown>) : null;
}

export async function getServiceHealthHistory(env: Env, serviceId: string | number, limit = 50): Promise<{ results: HealthCheck[] }> {
	const db = await getDb(env);
	const filter = serviceIdFilter(serviceId);
	const docs = await db
		.collection('health_checks')
		.find(filter as Record<string, unknown>)
		.sort({ timestamp: -1 } as Record<string, number>)
		.limit(limit)
		.toArray();
	return { results: docs.map((d: Record<string, unknown>) => docToHealthCheck(d)) };
}

export async function getServiceIncidents(env: Env, serviceId: string | number): Promise<{ results: Incident[] }> {
	const db = await getDb(env);
	const filter = serviceIdFilter(serviceId);
	const docs = await db
		.collection('incidents')
		.find({ ...filter, status: 'open' } as Record<string, unknown>)
		.sort({ created_at: -1 } as Record<string, number>)
		.toArray();
	return { results: docs.map((d: Record<string, unknown>) => docToIncident(d)) };
}

export async function getServicesWithRecentHistory(env: Env): Promise<
	Array<Service & { history: HealthCheck[]; latest: HealthCheck | { status: string; timestamp: string } }>
> {
	const db = await getDb(env);
	const servicesCol = db.collection('services');
	const healthCol = db.collection('health_checks');

	const { results: services } = await getAllServices(env);
	if (services.length === 0) return [];

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	// Single query for recent window, then slice per service in JS (keeps in-memory fallback simple)
	const sids = services.map((s) => toSid(s.id)).filter(Boolean) as SimpleObjectId[];
	const allRecent =
		sids.length > 0
			? await healthCol
					.find({ service_id: { $in: sids }, timestamp: { $gte: since } } as unknown as Record<string, unknown>)
					.sort({ timestamp: -1 } as Record<string, number>)
					.toArray()
			: [];

	const historyByService = new Map<string, HealthCheck[]>();
	for (const raw of allRecent as Record<string, unknown>[]) {
		const hc = docToHealthCheck(raw);
		// keep at most 30 per service (already sorted desc)
		const list = historyByService.get(hc.service_id);
		if (!list) historyByService.set(hc.service_id, [hc]);
		else if (list.length < 30) list.push(hc);
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

export async function getHistoricalOutages(env: Env): Promise<{
	results: { name: string; status_code: number; response_snippet: string; timestamp: string }[];
}> {
	const db = await getDb(env);
	const healthCol = db.collection('health_checks');
	const servicesCol = db.collection('services');

	const rawOutages = await healthCol.find({ status: 'down' } as Record<string, unknown>).sort({ timestamp: -1 } as Record<string, number>).limit(10).toArray();

	if (rawOutages.length === 0) return { results: [] };

	// Resolve service names via JS (avoids $lookup incompat with in-memory)
	const neededIds = [...new Set(rawOutages.map((r: Record<string, unknown>) => r.service_id as unknown))];
	const oidNeeded = neededIds.filter((v) => v instanceof SimpleObjectId) as SimpleObjectId[];
	const strNeeded = neededIds.filter((v) => typeof v === 'string') as string[];
	const orFilters: Record<string, unknown>[] = [];
	if (oidNeeded.length > 0) orFilters.push({ _id: { $in: oidNeeded } } as unknown as Record<string, unknown>);
	// strNeeded fallback — services stored with ObjectId, so str ids won't match; keep for safety
	if (strNeeded.length > 0) {
		const converted = strNeeded.map((s) => (SimpleObjectId.isValid(s) ? new SimpleObjectId(s) : s)).filter((v) => v instanceof SimpleObjectId) as SimpleObjectId[];
		if (converted.length > 0) orFilters.push({ _id: { $in: converted } } as unknown as Record<string, unknown>);
	}

	let idToName = new Map<string, string>();
	if (orFilters.length > 0) {
		const services = await servicesCol.find({ $or: orFilters } as unknown as Record<string, unknown>).toArray();
		for (const s of services as Record<string, unknown>[]) {
			const hex = (s._id as SimpleObjectId) instanceof SimpleObjectId ? (s._id as SimpleObjectId).toHexString() : String(s._id);
			idToName.set(hex, String(s.name ?? ''));
		}
	}

	const results = (rawOutages as Record<string, unknown>[]).map((h) => {
		const sid = h.service_id as SimpleObjectId | string;
		const hex = sid instanceof SimpleObjectId ? sid.toHexString() : String(sid);
		return {
			name: idToName.get(hex) ?? hex,
			status_code: Number(h.status_code ?? 0),
			response_snippet: String(h.response_snippet ?? ''),
			timestamp: toIsoString(h.timestamp),
		};
	});
	return { results };
}

export async function getActiveIncidents(env: Env): Promise<{ results: Incident[] }> {
	const db = await getDb(env);
	const incidentsCol = db.collection('incidents');
	const servicesCol = db.collection('services');

	const raw = await incidentsCol.find({ status: 'open' } as Record<string, unknown>).sort({ created_at: -1 } as Record<string, number>).toArray();

	if (raw.length === 0) return { results: [] };

	const sids = [...new Set((raw as Record<string, unknown>[]).map((r) => r.service_id).filter(Boolean))] as unknown[];
	const oidSids = (sids as (SimpleObjectId | string)[]).filter((v) => v instanceof SimpleObjectId || (typeof v === 'string' && SimpleObjectId.isValid(v as string)));
	const lookupIds = oidSids.map((v) => (v instanceof SimpleObjectId ? v : new SimpleObjectId(v as string))) as SimpleObjectId[];

	let idToName = new Map<string, string>();
	if (lookupIds.length > 0) {
		const services = await servicesCol.find({ _id: { $in: lookupIds } } as unknown as Record<string, unknown>).toArray();
		for (const s of services as Record<string, unknown>[]) {
			const hex = (s._id as SimpleObjectId) instanceof SimpleObjectId ? (s._id as SimpleObjectId).toHexString() : String(s._id);
			idToName.set(hex, String(s.name ?? ''));
		}
	}

	const results = (raw as Record<string, unknown>[]).map((doc) => {
		const inc = docToIncident(doc);
		const sidHex = inc.service_id ? String(inc.service_id) : null;
		if (sidHex) (inc as Incident & { service_name?: string }).service_name = idToName.get(sidHex) ?? undefined;
		return inc;
	});
	return { results };
}

export async function getSystemHistory(env: Env): Promise<{ results: { timestamp: string; status: string; latency_ms: number }[] }> {
	const db = await getDb(env);
	const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
	const docs = await db
		.collection('health_checks')
		.find({ timestamp: { $gte: since } } as unknown as Record<string, unknown>)
		.sort({ timestamp: 1 } as Record<string, number>)
		.toArray();

	if (docs.length === 0) return { results: [] };

	// Bucket by minute UTC `YYYY-MM-DD HH:MM`
	const buckets = new Map<string, { statuses: string[]; latencies: number[] }>();
	for (const raw of docs as Record<string, unknown>[]) {
		const ts = raw.timestamp instanceof Date ? (raw.timestamp as Date) : new Date(String(raw.timestamp));
		const key = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}-${String(ts.getUTCDate()).padStart(2, '0')} ${String(ts.getUTCHours()).padStart(2, '0')}:${String(ts.getUTCMinutes()).padStart(2, '0')}`;
		let b = buckets.get(key);
		if (!b) {
			b = { statuses: [], latencies: [] };
			buckets.set(key, b);
		}
		b.statuses.push(String(raw.status ?? 'unknown'));
		b.latencies.push(Number(raw.latency_ms ?? 0));
	}

	const results: { timestamp: string; status: string; latency_ms: number }[] = [];
	for (const [timestamp, b] of buckets) {
		const minIsUp = b.statuses.every((s) => s === 'up');
		const maxIsDown = b.statuses.every((s) => s === 'down');
		let status = 'degraded';
		if (minIsUp) status = 'up';
		else if (maxIsDown) status = 'down';
		const latency_ms = Math.round(b.latencies.reduce((a, c) => a + c, 0) / b.latencies.length);
		results.push({ timestamp, status, latency_ms });
	}
	// Desc order, limit 30
	results.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
	return { results: results.slice(0, 30) };
}

export async function getSystemUptime(env: Env): Promise<string> {
	const db = await getDb(env);
	const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
	const docs = await db
		.collection('health_checks')
		.find({ timestamp: { $gte: since } } as unknown as Record<string, unknown>)
		.toArray();
	if (docs.length === 0) return '100.00';
	const up = (docs as Record<string, unknown>[]).filter((d) => d.status === 'up').length;
	return ((up / docs.length) * 100).toFixed(2);
}

async function getLatestStatusByService(env: Env): Promise<Map<string, string>> {
	const db = await getDb(env);
	const col = db.collection('health_checks');
	// Aggregate: group by service_id, get max timestamp or first after sort
	// For compatibility with in-memory, we fetch all and reduce in JS
	const all = await col.find({}).toArray();
	const latestBySid = new Map<string, { ts: number; status: string }>();
	for (const raw of all as Record<string, unknown>[]) {
		const sid = raw.service_id as SimpleObjectId | string;
		const hex = sid instanceof SimpleObjectId ? sid.toHexString() : String(sid);
		const ts = raw.timestamp instanceof Date ? (raw.timestamp as Date).getTime() : new Date(String(raw.timestamp)).getTime();
		const existing = latestBySid.get(hex);
		if (!existing || ts > existing.ts) latestBySid.set(hex, { ts, status: String(raw.status ?? 'unknown') });
	}
	const out = new Map<string, string>();
	for (const [k, v] of latestBySid) out.set(k, v.status);
	return out;
}

/**
 * Prevents overlapping cron invocations (and concurrent /api/check calls)
 * from double-checking services and double-writing.
 * Backed by Mongo kv_cache with TTL semantics.
 */
async function acquireCheckLock(env: Env): Promise<boolean> {
	const db = await getDb(env);
	const col = db.collection('kv_cache');
	const now = new Date();
	const existing = await col.findOne({ key: CRON_LOCK_KEY } as Record<string, unknown>);
	if (existing) {
		const expRaw = (existing as Record<string, unknown>).expires_at;
		const exp = expRaw instanceof Date ? (expRaw as Date) : new Date(String(expRaw));
		if (exp.getTime() > now.getTime()) return true;
	}
	const expiresAt = new Date(Date.now() + CRON_LOCK_SECONDS * 1000);
	await col.updateOne(
		{ key: CRON_LOCK_KEY } as Record<string, unknown>,
		{ $set: { key: CRON_LOCK_KEY, value: new Date().toISOString(), expires_at: expiresAt } } as Record<string, unknown>,
		{ upsert: true } as Record<string, unknown>,
	);
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

	// All inserts go out as batched insertMany (Mongo) — no D1 batch limit needed but chunk for safety.
	const docs = outcomes.map((o) => o.doc).filter(Boolean);
	if (docs.length > 0) {
		const db = await getDb(env);
		await db.collection('health_checks').insertMany(docs as unknown as Record<string, unknown>[]);
	}

	return outcomes.filter((o): o is CheckOutcome & { change: StatusChange } => o.change !== null).map((o) => o.change);
}

export async function cleanupOldHealthChecks(env: Env, keepDays = 90): Promise<void> {
	const db = await getDb(env);
	const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
	await db.collection('health_checks').deleteMany({ timestamp: { $lt: cutoff } } as unknown as Record<string, unknown>);
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
	if (!email) return null;
	const db = await getDb(env);
	const doc = await db.collection('users').findOne({ email } as Record<string, unknown>);
	return doc ? docToUser(doc as Record<string, unknown>) : null;
}

export async function registerUser(env: Env, email: string): Promise<void> {
	if (!email) throw new Error('registerUser: email required');
	const db = await getDb(env);
	await db.collection('users').updateOne(
		{ email } as Record<string, unknown>,
		{ $set: { last_login: new Date() }, $setOnInsert: { email, notifications_enabled: 1 } } as Record<string, unknown>,
		{ upsert: true } as Record<string, unknown>,
	);
}

export async function updateNotificationPref(env: Env, email: string, enabled: number): Promise<void> {
	if (!email) throw new Error('updateNotificationPref: email required');
	const db = await getDb(env);
	await db.collection('users').updateOne({ email } as Record<string, unknown>, { $set: { notifications_enabled: enabled } } as Record<string, unknown>);
}

export async function addService(env: Env, data: Record<string, string | null>): Promise<void> {
	if (!data.name || !data.url || !data.health_endpoint) throw new Error('addService: name, url, health_endpoint required');
	const db = await getDb(env);
	await db.collection('services').insertOne({
		name: data.name,
		url: data.url,
		health_endpoint: data.health_endpoint,
		method: data.method ?? 'GET',
		headers_json: data.headers_json ?? null,
		body: data.body ?? null,
		token_url: data.token_url ?? null,
		token_body: data.token_body ?? null,
		token_response_path: data.token_response_path ?? null,
		icon: data.icon ?? null,
	} as unknown as Record<string, unknown>);
}

export async function removeService(env: Env, id: string | number): Promise<void> {
	const db = await getDb(env);
	const svcOid = toSid(String(id));
	const sidFilter: Record<string, unknown> = svcOid ? { service_id: svcOid } : { service_id: String(id) };
	const svcFilter = idFilter(id);

	await Promise.all([
		db.collection('health_checks').deleteMany(sidFilter as Record<string, unknown>),
		db.collection('incidents').deleteMany(sidFilter as Record<string, unknown>),
		db.collection('services').deleteOne(svcFilter as Record<string, unknown>),
	]);
}

export async function createIncident(env: Env, title: string, message: string, service_id: string | null): Promise<void> {
	if (!title) throw new Error('createIncident: title required');
	const db = await getDb(env);
	const sid = service_id && SimpleObjectId.isValid(service_id) ? new SimpleObjectId(service_id) : null;
	// If service_id is non-hex but present, store as-is (defensive)
	const effectiveSid = sid ?? (service_id ? (service_id as unknown as SimpleObjectId) : null);
	await db.collection('incidents').insertOne({
		title,
		message,
		service_id: effectiveSid,
		status: 'open',
		created_at: new Date(),
		resolved_at: null,
	} as unknown as Record<string, unknown>);
}

export async function getIncidentWithService(env: Env, id: string | number): Promise<{ title: string; service_name: string | null } | null> {
	const db = await getDb(env);
	const inc = await db.collection('incidents').findOne(idFilter(id) as Record<string, unknown>);
	if (!inc) return null;
	const raw = inc as Record<string, unknown>;
	const title = String(raw.title ?? '');
	let service_name: string | null = null;
	const sid = raw.service_id as SimpleObjectId | string | null;
	if (sid) {
		const hex = sid instanceof SimpleObjectId ? sid.toHexString() : String(sid);
		const oid = SimpleObjectId.isValid(hex) ? new SimpleObjectId(hex) : null;
		if (oid) {
			const svc = await db.collection('services').findOne({ _id: oid } as unknown as Record<string, unknown>);
			if (svc) service_name = String((svc as Record<string, unknown>).name ?? '');
		}
	}
	return { title, service_name };
}

export async function resolveIncident(env: Env, id: string | number): Promise<void> {
	const db = await getDb(env);
	await db.collection('incidents').updateOne(idFilter(id) as Record<string, unknown>, {
		$set: { status: 'resolved', resolved_at: new Date() },
	} as Record<string, unknown>);
}

export async function getServiceName(env: Env, id: string | number): Promise<{ name: string } | null> {
	const db = await getDb(env);
	let doc: Record<string, unknown> | null = null;
	// id may be service_id hex; try _id lookup
	const oid = toSid(String(id));
	if (oid) {
		doc = (await db.collection('services').findOne({ _id: oid } as unknown as Record<string, unknown>)) as Record<string, unknown> | null;
	}
	if (!doc) {
		// fallback: if id was not hex, try name lookup (should not happen)
		doc = (await db.collection('services').findOne(idFilter(id) as Record<string, unknown>)) as Record<string, unknown> | null;
	}
	if (!doc) return null;
	return { name: String(doc.name ?? '') };
}
