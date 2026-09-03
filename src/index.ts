import { renderStatusPage } from './pages/StatusPage';
import { renderAdminPage } from './pages/AdminPage';
import { renderServiceDetailPage } from './pages/ServiceDetailPage';
import { Env } from './types';
import { isAuthenticated } from './utils/auth';
import { getBadgeStatus } from './utils/badge';
import { svgToPng } from './utils/image';
import { slugify, resolveIconUrl, resolveServiceIconUrls } from './utils/icon';
import { html, json, redirect, notFound, corsHeaders } from './utils/response';
import { err, overallStatus } from './utils/helpers';
import {
	RATE_LIMITS,
	checkRateLimit,
	extractClientIp,
	buildRateLimitKey,
	createRateLimitResponse,
	getRateLimitHeaders,
	purgeExpiredRateLimits,
} from './utils/rateLimit';
import { clearSessionCookie } from './services/session';
import * as db from './services/db';
import * as admin from './services/admin';
import { notifyStatusChanges } from './utils/notifications';
import { getDb } from './lib/mongo';
import resvgWasm from '../public/resvg.wasm';

async function handleBadge(env: Env, url: URL, path: string): Promise<Response | null> {
	if (!path.startsWith('/badge/')) return null;
	const isPng = path.endsWith('.png');
	const serviceName = decodeURIComponent(path.substring(7, path.length - 4));

	const status = await getBadgeStatus(env, serviceName);
	const badgeStatus = status === 'up' ? 'up' : status === 'down' ? 'down' : 'degraded';

	const assetUrl = new URL(`/badges/${badgeStatus}.svg`, url.origin);
	const svgText = await (await env.ASSETS.fetch(assetUrl.toString())).text();

	if (isPng) {
		try {
			const png = await svgToPng(svgText, 512, 512, resvgWasm);
			return new Response(new Uint8Array(png), {
				headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
			});
		} catch (e) {
			return new Response(`Error generating PNG: ${err(e)}`, { status: 500 });
		}
	}

	return new Response(svgText, {
		headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
	});
}

async function handleApiCheck(env: Env, ctx: ExecutionContext, path: string, request: Request): Promise<Response | null> {
	if (path !== '/api/check') return null;
	const ip = extractClientIp(request);
	const key = buildRateLimitKey('apiCheck', ip);
	const result = await checkRateLimit(env, key, { ...RATE_LIMITS.apiCheck, failClosed: false });
	if (!result.allowed) return createRateLimitResponse(result);
	const statusChanges = await db.performAllHealthChecks(env);
	if (statusChanges.length > 0) ctx.waitUntil(notifyStatusChanges(env, statusChanges));
	return new Response('Health check triggered and saved to MongoDB', { headers: { ...corsHeaders(), ...getRateLimitHeaders(result) } });
}

async function handleHealthEndpoint(env: Env, path: string): Promise<Response | null> {
	if (path !== '/api/health') return null;

	// Mongo: fetch services + latest health per service + open incident count via JS
	const mdb = await getDb(env);
	const services = await mdb.collection('services').find({}).toArray();
	const healthChecks = await mdb.collection('health_checks').find({}).toArray();
	const incidentCount = await mdb.collection('incidents').countDocuments({ status: 'open' } as Record<string, unknown>);

	// Compute latest health per service (max timestamp)
	const latestBySid = new Map<string, { status: string | null; latency_ms: number | null }>();
	for (const raw of healthChecks as Record<string, unknown>[]) {
		const sid = raw.service_id as { toHexString?: () => string } | string;
		const hex =
			sid && typeof sid === 'object' && 'toHexString' in (sid as Record<string, unknown>)
				? (sid as { toHexString: () => string }).toHexString()
				: String(sid);
		const ts = raw.timestamp instanceof Date ? (raw.timestamp as Date).getTime() : new Date(String(raw.timestamp)).getTime();
		const existing = latestBySid.get(hex);
		// We need to compare timestamps; store best per sid
		if (!existing || ts > (existing as unknown as { _ts: number })._ts) {
			(latestBySid as unknown as Map<string, unknown>).set(hex, {
				status: raw.status ?? null,
				latency_ms: raw.latency_ms ?? null,
				_ts: ts,
			} as unknown);
		}
	}
	// Strip internal _ts before use
	const cleanedLatest = new Map<string, { status: string | null; latency_ms: number | null }>();
	for (const [k, v] of latestBySid) {
		const vv = v as unknown as { status: string | null; latency_ms: number | null; _ts: number };
		cleanedLatest.set(k, { status: vv.status, latency_ms: vv.latency_ms });
	}

	const rows = (services as Record<string, unknown>[]).map((s) => {
		const hex =
			(s._id as { toHexString?: () => string } | string) && typeof s._id === 'object' && (s._id as Record<string, unknown>).toHexString
				? (s._id as { toHexString: () => string }).toHexString()
				: String(s._id);
		const latest = cleanedLatest.get(hex);
		return {
			name: String(s.name ?? ''),
			status: latest?.status ?? null,
			latency_ms: latest?.latency_ms ?? null,
			incident_count: incidentCount,
		};
	});

	const incidentCountVal = rows[0]?.incident_count ?? incidentCount ?? 0;
	const checked = rows.map((r) => ({ name: r.name, status: r.status || 'unknown', latency_ms: r.latency_ms }));
	const healthy = checked.filter((s) => s.status === 'up');
	const degraded = checked.filter((s) => s.status !== 'up' && s.status !== 'unknown');
	const unknown = checked.filter((s) => s.status === 'unknown');

	const hasDown = incidentCountVal > 0 || (checked.length > 0 && degraded.length === checked.length);

	return jsonWithStatus(
		{
			status: hasDown ? 'down' : degraded.length > 0 ? 'degraded' : 'up',
			services: { total: checked.length, healthy: healthy.length, degraded: degraded.length, unknown: unknown.length },
			incidents: incidentCountVal,
			checked,
		},
		hasDown ? 503 : 200,
	);
}

function jsonWithStatus(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
	});
}

async function handleServiceDetail(env: Env, path: string): Promise<Response | null> {
	if (!path.startsWith('/status/')) return null;
	const serviceName = decodeURIComponent(path.substring(8));
	const service = await db.getServiceByName(env, serviceName);
	if (!service) return notFound('Service Not Found');

	const [history, incidents, iconUrl] = await Promise.all([
		db.getServiceHealthHistory(env, service.id),
		db.getServiceIncidents(env, service.id),
		resolveIconUrl(slugify(service.icon || 'cloudflare')),
	]);

	return html(renderServiceDetailPage(service, history.results, incidents.results, iconUrl));
}

async function handleStatusPage(env: Env, path: string): Promise<Response | null> {
	if (path !== '/' && path !== '/api/status') return null;

	const [servicesWithHistory, historicalIncidents, manualIncidents, systemHistory, systemUptime] = await Promise.all([
		db.getServicesWithRecentHistory(env),
		db.getHistoricalOutages(env),
		db.getActiveIncidents(env),
		db.getSystemHistory(env),
		db.getSystemUptime(env),
	]);
	const iconUrls = await resolveServiceIconUrls(servicesWithHistory);

	const status = overallStatus(servicesWithHistory, manualIncidents.results);

	if (path === '/api/status') {
		return json({
			services: servicesWithHistory,
			historicalIncidents: historicalIncidents.results,
			manualIncidents: manualIncidents.results,
			system: { history: systemHistory.results, uptime: systemUptime },
			overall: { status: status.status, text: status.text },
		});
	}

	return html(
		renderStatusPage(
			servicesWithHistory,
			historicalIncidents.results,
			manualIncidents.results,
			{
				history: systemHistory.results,
				uptime: systemUptime,
			},
			iconUrls,
		),
	);
}

async function handleAdmin(env: Env, request: Request, url: URL, path: string): Promise<Response | null> {
	if (!path.startsWith('/admin')) return null;

	const adminPath = path.replace(/\/$/, '');
	const oidcConfigured = !!(env.AUTHELIA_ISSUER && env.AUTHELIA_CLIENT_ID);

	if (adminPath === '/admin/login' && request.method === 'POST') {
		const ip = extractClientIp(request);
		const key = buildRateLimitKey('login', ip);
		const result = await checkRateLimit(env, key, { ...RATE_LIMITS.login, failClosed: true });
		if (!result.allowed) return createRateLimitResponse(result);
		return admin.handlePasswordLogin(env, await request.formData());
	}
	if (adminPath === '/admin/login/oidc') {
		return redirect(
			`${env.AUTHELIA_ISSUER}/api/oidc/authorization?` +
				new URLSearchParams({
					client_id: env.AUTHELIA_CLIENT_ID,
					response_type: 'code',
					scope: 'openid profile email',
					redirect_uri: env.OIDC_REDIRECT_URI,
					state: crypto.randomUUID(),
				}),
		);
	}
	if (adminPath === '/admin/logout')
		return new Response(null, { status: 302, headers: { Location: '/admin', 'Set-Cookie': clearSessionCookie() } });
	if (adminPath === '/admin/callback') {
		const ip = extractClientIp(request);
		const key = buildRateLimitKey('adminCallback', ip);
		const result = await checkRateLimit(env, key, { ...RATE_LIMITS.adminCallback, failClosed: true });
		if (!result.allowed) return createRateLimitResponse(result);
		const code = url.searchParams.get('code');
		if (!code) return new Response('Bad Request', { status: 400 });
		return admin.handleOidcCallback(env, code);
	}

	const authPayload = (await isAuthenticated(request, env)) as { sub: string } | null;
	if (!authPayload) return html(renderAdminPage([], [], undefined, undefined, false, oidcConfigured));

	if (request.method === 'POST') {
		const key = buildRateLimitKey('adminWrite', authPayload.sub);
		const result = await checkRateLimit(env, key, { ...RATE_LIMITS.adminWrite, failClosed: true });
		if (!result.allowed) return createRateLimitResponse(result);
		const formData = await request.formData();
		if (adminPath === '/admin/notifications/toggle') return admin.handleToggleNotifications(env, formData, authPayload.sub);
		if (adminPath === '/admin/add') return admin.handleAddService(env, formData);
		if (adminPath === '/admin/remove') return admin.handleRemoveService(env, formData);
		if (adminPath === '/admin/incidents/create') return admin.handleCreateIncident(env, formData);
		if (adminPath === '/admin/incidents/resolve') return admin.handleResolveIncident(env, formData);
	}

	// Fail-fast data load: avoid Workers hung detection (30s) if getDb/ensureIndexes hangs
	try {
		const adminData = await Promise.race([
			Promise.all([db.getAllServices(env), db.getActiveIncidents(env), db.getUserByEmail(env, authPayload.sub)]),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('admin data timeout after 5000ms')), 5_000)),
		]);
		const [services, activeIncidents, user] = adminData as [
			Awaited<ReturnType<typeof db.getAllServices>>,
			Awaited<ReturnType<typeof db.getActiveIncidents>>,
			Awaited<ReturnType<typeof db.getUserByEmail>>,
		];
		return html(renderAdminPage(services.results, activeIncidents.results, user ?? undefined, undefined, true, oidcConfigured));
	} catch (e) {
		console.error('[admin] failed to load dashboard data:', e instanceof Error ? e.message : String(e));
		return new Response(
			'<h1>Admin temporarily unavailable</h1><p>Database connection failed — please retry. If MONGODB_URI uses mongodb+srv://, switch to direct mongodb://.</p>',
			{
				status: 503,
				headers: { 'Content-Type': 'text/html', 'Retry-After': '10' },
			},
		);
	}
}

export default {
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		try {
			// Startup provisioning: getDb() lazily calls ensureIndexes() on first use, which
			// creates unique indexes (kv_cache.key, rate_limits.key) and TTL for kv_cache.
			// Fresh Atlas DBs are seeded via `node scripts/seed.mongo.mjs` (or setup.mjs auto-seed);
			// performAllHealthChecks early-returns on 0 services, so seeding is required for monitoring.
			// Prune history BEFORE running checks so the database never stays full
			// and silently blocks the INSERTs below (which would halt all monitoring).
			const now = new Date();
			if (now.getUTCHours() === 3) {
				await db.cleanupOldHealthChecks(env, 90).catch((e) => console.error('[cron] cleanup failed:', e));
				await purgeExpiredRateLimits(env).catch((e) => console.error('[cron] purge rate limits failed:', e));
			}

			const statusChanges = await db.performAllHealthChecks(env);
			if (statusChanges.length > 0) ctx.waitUntil(notifyStatusChanges(env, statusChanges));
		} catch (e) {
			console.error('[cron] scheduled failed:', e instanceof Error ? e.message : String(e));
		}
	},

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			// First fetch triggers getDb() -> ensureIndexes() (unique key indexes + TTL) and validates Atlas connectivity via ping in seed script.
			const url = new URL(request.url);
			const path = url.pathname;

			return (
				(await handleBadge(env, url, path)) ??
				(await handleApiCheck(env, ctx, path, request)) ??
				(await handleHealthEndpoint(env, path)) ??
				(await handleServiceDetail(env, path)) ??
				(await handleStatusPage(env, path)) ??
				(await handleAdmin(env, request, url, path)) ??
				notFound()
			);
		} catch (e) {
			console.error('[fetch] unhandled error:', e instanceof Error ? e.message : String(e));
			return new Response('Internal Server Error — please retry', { status: 500, headers: { 'Retry-After': '5' } });
		}
	},
} satisfies ExportedHandler<Env>;
