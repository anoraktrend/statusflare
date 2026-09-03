#!/usr/bin/env node
/**
 * Seed MongoDB Atlas with initial services if collection is empty.
 * Mirrors seed.sql (9 services) for fresh Atlas DB after D1 -> Mongo migration.
 * Prevents silent no-op monitoring when performAllHealthChecks early-returns on 0 services.
 *
 * Usage:
 *   node scripts/seed.mongo.mjs              # uses MONGODB_URI from .dev.vars or env
 *   node scripts/seed.mongo.mjs --force      # upsert-repair existing wrong endpoints + insert missing
 *   node scripts/seed.mongo.mjs --repair     # alias for --force (repairs wrong health_endpoint)
 *   MONGODB_URI="mongodb://..." node scripts/seed.mongo.mjs
 *
 * Direct mongodb:// URI is required on Workers (nodejs_compat lacks dns.resolveSrv).
 * An SRV URI (mongodb+srv://) will be rejected with a warning.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_SERVICES = [
	{
		name: 'Seerr',
		url: 'https://seerr.helltop.net',
		health_endpoint: '/api/v1/status',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'seerr',
	},
	{
		name: 'LDAP (lldap)',
		url: 'https://ldap.helltop.net',
		health_endpoint: '/',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'lldap',
	},
	{
		name: 'Auth (Authelia)',
		url: 'https://auth.helltop.net',
		health_endpoint: '/api/health',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'authelia',
	},
	{
		name: 'Immich',
		url: 'https://immich.helltop.net',
		health_endpoint: '/api/server/ping',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'immich',
	},
	{
		name: 'Jellyfin',
		url: 'https://jellyfin.helltop.net',
		health_endpoint: '/System/Info/Public',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'jellyfin',
	},
	{
		name: 'Git (Forgejo)',
		url: 'https://git.helltop.net',
		health_endpoint: '/api/healthz',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'forgejo',
	},
	{
		name: 'Cloud (Nextcloud)',
		url: 'https://cloud.helltop.net',
		health_endpoint: '/status.php',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'nextcloud',
	},
	{
		name: 'Vaultwarden',
		url: 'https://vault.helltop.net',
		health_endpoint: '/alive',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'vaultwarden',
	},
	{
		name: 'Romm',
		url: 'https://games.helltop.net',
		health_endpoint: '/api/heartbeat',
		method: 'GET',
		headers_json: null,
		body: null,
		token_url: null,
		token_body: null,
		token_response_path: null,
		icon: 'retroarch',
	},
];

function parseDotEnv(path) {
	try {
		const content = readFileSync(path, 'utf-8');
		const out = {};
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim();
			let val = trimmed.slice(eq + 1).trim();
			if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
			out[key] = val;
		}
		return out;
	} catch {
		return {};
	}
}

function resolveMongoEnv() {
	// Precedence: process.env -> .dev.vars -> atlas-credentials.env
	let uri = process.env.MONGODB_URI;
	let dbName = process.env.MONGODB_DB_NAME || 'statusflare';

	if (!uri) {
		const devVarsPath = resolve(process.cwd(), '.dev.vars');
		if (existsSync(devVarsPath)) {
			const parsed = parseDotEnv(devVarsPath);
			uri = parsed.MONGODB_URI;
			if (parsed.MONGODB_DB_NAME) dbName = parsed.MONGODB_DB_NAME;
		}
	}
	if (!uri) {
		const atlasPath = resolve(process.cwd(), 'atlas-credentials.env');
		if (existsSync(atlasPath)) {
			const parsed = parseDotEnv(atlasPath);
			if (parsed.MONGODB_URI_DIRECT) uri = parsed.MONGODB_URI_DIRECT?.replace(/\/\*.*\*\//, '').trim();
			if (!uri) uri = parsed.MONGODB_URI;
		}
	}
	// Strip surrounding quotes if present
	if (uri) uri = uri.replace(/^["']|["']$/g, '');
	return { uri, dbName };
}

function isDirectUri(uri) {
	if (!uri) return false;
	if (uri.startsWith('mongodb+srv://')) return false;
	return uri.startsWith('mongodb://');
}

export async function seedMongoIfEmpty(options = {}) {
	const force = options.force === true || options.repair === true;
	const isRepair = options.repair === true || force;
	const { uri, dbName } = resolveMongoEnv();

	if (!uri) {
		console.error('[seed] MONGODB_URI not found — set in .dev.vars or env. Skipping seed.');
		return { seeded: false, reason: 'no-uri' };
	}
	if (!isDirectUri(uri)) {
		console.warn('[seed] WARN: MONGODB_URI uses mongodb+srv:// — Workers (workerd) lacks dns.resolveSrv and will fail with EBADQUERY.');
		console.warn('[seed] Use direct mongodb:// with replicaSet shards (see .dev.vars or atlas-credentials.env MONGODB_URI_DIRECT).');
		// Continue anyway for local Node seeding; SRV works in Node but not in Workers
	}

	let MongoClient;
	try {
		const mod = await import('mongodb');
		MongoClient = mod.MongoClient;
	} catch (e) {
		console.error('[seed] Failed to import mongodb driver. Run pnpm install. Error:', e instanceof Error ? e.message : String(e));
		return { seeded: false, reason: 'no-driver' };
	}

	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 10_000,
		connectTimeoutMS: 10_000,
	});

	try {
		await client.connect();
		const db = client.db(dbName);
		// Validate connectivity
		await db.command({ ping: 1 });
		console.log(`[seed] Connected to ${dbName} at ${uri.split('@')[1]?.split('/')[0] ?? 'atlas'}`);

		// Ensure indexes/validators (mirrors src/lib/mongo.ts ensureIndexes) — best-effort
		try {
			await db.createCollection('services', {
				validator: {
					$jsonSchema: {
						bsonType: 'object',
						required: ['name', 'url', 'health_endpoint'],
						properties: {
							name: { bsonType: 'string' },
							url: { bsonType: 'string' },
							health_endpoint: { bsonType: 'string' },
						},
					},
				},
			});
		} catch {}
		for (const col of ['health_checks', 'incidents', 'kv_cache', 'rate_limits', 'users', 'status_changes']) {
			try {
				await db.createCollection(col);
			} catch {}
		}
		try {
			await Promise.all([
				db.collection('services').createIndex({ name: 1 }, { unique: true, background: true }),
				db.collection('health_checks').createIndex({ service_id: 1 }, { background: true }),
				db.collection('health_checks').createIndex({ timestamp: 1 }, { background: true }),
				db.collection('health_checks').createIndex({ service_id: 1, timestamp: 1 }, { background: true }),
				db.collection('health_checks').createIndex({ status: 1, timestamp: 1 }, { background: true }),
				db.collection('incidents').createIndex({ service_id: 1 }, { background: true }),
				db.collection('incidents').createIndex({ status: 1 }, { background: true }),
				db.collection('rate_limits').createIndex({ key: 1 }, { unique: true, background: true }),
				db.collection('rate_limits').createIndex({ window_start: 1 }, { background: true }),
				db.collection('kv_cache').createIndex({ key: 1 }, { unique: true, background: true }),
				db.collection('kv_cache').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, background: true }),
				db.collection('users').createIndex({ email: 1 }, { unique: true, background: true }),
				db.collection('status_changes').createIndex({ service_id: 1, timestamp: 1 }, { background: true }),
				db.collection('status_changes').createIndex({ timestamp: 1 }, { background: true }),
			]);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!msg.includes('already exists') && !msg.includes('IndexOptionsConflict')) console.warn('[seed] ensureIndexes warning:', msg);
		}

		const count = await db.collection('services').countDocuments();

		// --force / --repair: upsert-correct each SEED_SERVICES entry so wrong health_endpoint values get repaired
		if (force && count > 0) {
			console.log(
				`[seed] --${isRepair && options.repair ? 'repair' : 'force'}: repairing ${SEED_SERVICES.length} services (upsert by name) to fix wrong endpoints...`,
			);
			const ops = SEED_SERVICES.map((s) => ({
				updateOne: {
					filter: { name: s.name },
					update: {
						$set: {
							url: s.url,
							health_endpoint: s.health_endpoint,
							method: s.method,
							icon: s.icon,
							headers_json: s.headers_json,
							body: s.body,
							token_url: s.token_url,
							token_body: s.token_body,
							token_response_path: s.token_response_path,
						},
					},
					upsert: true,
				},
			}));
			const res = await db.collection('services').bulkWrite(ops, { ordered: false });
			const modified = res.modifiedCount ?? 0;
			const upserted = res.upsertedCount ?? 0;
			const matched = res.matchedCount ?? 0;
			console.log(
				`[seed] Repaired ${matched} existing, upserted ${upserted} new, modified ${modified} (total ${SEED_SERVICES.length} seed entries).`,
			);
			// Verify after
			const afterDocs = await db.collection('services').find({}).toArray();
			const afterCount = afterDocs.length;
			const mismatchedAfter = afterDocs.filter((d) => {
				const seed = SEED_SERVICES.find((s) => s.name === d.name);
				if (!seed) return false;
				return d.health_endpoint !== seed.health_endpoint || d.url !== seed.url;
			});
			if (mismatchedAfter.length > 0) {
				console.warn('[seed] Still mismatched after repair:', mismatchedAfter.map((d) => `${d.name}: ${d.health_endpoint}`).join(', '));
			} else {
				console.log('[seed] All endpoints now match seed.sql.');
			}
			return { seeded: true, repaired: true, modified, upserted, matched, count: afterCount };
		}

		if (count > 0 && !force) {
			// Already seeded — check for drift and hint repair
			const existing = await db.collection('services').find({}).toArray();
			const mismatched = [];
			for (const seed of SEED_SERVICES) {
				const doc = existing.find((d) => d.name === seed.name);
				if (!doc) mismatched.push(`${seed.name}: MISSING (expected ${seed.health_endpoint})`);
				else if (doc.health_endpoint !== seed.health_endpoint || doc.url !== seed.url) {
					mismatched.push(
						`${seed.name}: wrong endpoint "${doc.health_endpoint}" -> should be "${seed.health_endpoint}" (url ${doc.url} -> ${seed.url})`,
					);
				}
			}
			if (mismatched.length > 0) {
				console.warn(`[seed] services already seeded (${count} docs) but ${mismatched.length} endpoint(s) mismatched:`);
				for (const m of mismatched) console.warn('  -', m);
				console.warn('[seed] Run `node scripts/seed.mongo.mjs --force` or `--repair` to correct existing entries (upsert by name).');
			} else {
				console.log(`[seed] services already seeded (${count} docs) — all endpoints correct. Use --force/--repair to re-apply.`);
			}
			return { seeded: false, reason: 'already-seeded', count, mismatched };
		}

		let inserted = 0;
		try {
			const res = await db.collection('services').insertMany(SEED_SERVICES, { ordered: false });
			inserted = res.insertedCount ?? Object.keys(res.insertedIds ?? {}).length;
		} catch (e) {
			// If unique index blocks duplicates, count inserted before error
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('duplicate key') || msg.includes('E11000')) {
				const after = await db.collection('services').countDocuments();
				inserted = after - count;
				console.warn('[seed] Some services already existed (unique name) — inserted', inserted, 'new.');
			} else throw e;
		}
		console.log(`[seed] Seeded ${inserted} services into ${dbName}.services`);
		if (inserted > 0) console.log('[seed] Done. Monitoring will start on next cron (or /api/check).');
		return { seeded: inserted > 0, inserted, count: count + inserted };
	} finally {
		try {
			await client.close();
		} catch {}
	}
}

// CLI entry when run directly: node scripts/seed.mongo.mjs [--force|--repair]
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
	const force = process.argv.includes('--force') || process.argv.includes('-f');
	const repair = process.argv.includes('--repair');
	const opts = { force: force || repair, repair };
	seedMongoIfEmpty(opts).then(
		(r) => process.exit(r.seeded ? 0 : 0),
		(e) => {
			console.error('[seed] Failed:', e instanceof Error ? e.message : String(e));
			process.exit(1);
		},
	);
}
