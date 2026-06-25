import { renderStatusPage } from './pages/StatusPage';
import { renderAdminPage } from './pages/AdminPage';
import { renderServiceDetailPage } from './pages/ServiceDetailPage';
import { Env, Service, StatusChange } from './types';
import { isAuthenticated } from './utils/auth';
import { getBadgeStatus } from './utils/badge';
import { svgToPng } from './utils/image';
import { html, json, redirect, notFound, corsHeaders } from './utils/response';
import { createSessionJwt, sessionCookie, clearSessionCookie } from './services/session';
import * as db from './services/db';
import * as admin from './services/admin';
import { notifyStatusChanges } from './utils/notifications';
import resvgWasm from '../public/resvg.wasm';

async function handleBadge(env: Env, url: URL, path: string): Promise<Response | null> {
	if (!path.startsWith('/badge/')) return null;
	const isPng = path.endsWith('.png');
	const serviceName = decodeURIComponent(path.substring(7, path.length - 4));

	const status = await getBadgeStatus(env, serviceName);
	const badgeStatus = status === 'up' ? 'up' : status === 'down' ? 'down' : 'degraded';

	const assetUrl = new URL(`/badges/${badgeStatus}.svg`, url.origin);
	const assetRes = await env.ASSETS.fetch(assetUrl.toString());
	const svgText = await assetRes.text();

	if (isPng) {
		try {
			const png = await svgToPng(svgText, 512, 512, resvgWasm);
			return new Response(new Uint8Array(png), {
				headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
			});
		} catch (e: unknown) {
			return new Response(`Error generating PNG: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
		}
	}

	return new Response(svgText, {
		headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
	});
}

async function handleApiCheck(env: Env, ctx: ExecutionContext): Promise<Response | null> {
	const statusChanges = await db.performAllHealthChecks(env);
	if (statusChanges.length > 0) ctx.waitUntil(notifyStatusChanges(env, statusChanges));
	return new Response('Health check triggered and saved to D1', { headers: corsHeaders() });
}

async function handleServiceDetail(env: Env, path: string): Promise<Response | null> {
	if (!path.startsWith('/status/')) return null;
	const serviceName = decodeURIComponent(path.substring(8));
	const service = await db.getServiceByName(env, serviceName);
	if (!service) return notFound('Service Not Found');

	const [history, incidents] = await Promise.all([
		db.getServiceHealthHistory(env, service.id),
		db.getServiceIncidents(env, service.id),
	]);

	return html(renderServiceDetailPage(service, history.results, incidents.results));
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

	if (path === '/api/status') {
		const checkedServices = servicesWithHistory.filter((s) => s.latest.status !== 'unknown');
		const allUp = checkedServices.length > 0 && checkedServices.every((s) => s.latest.status === 'up');
		const allDown = checkedServices.length > 0 && checkedServices.every((s) => s.latest.status === 'down');
		const hasManualIncident = manualIncidents.results.length > 0;

		let overallStatus: string;
		let overallStatusText: string;
		if (hasManualIncident || allDown) {
			overallStatus = 'down';
			overallStatusText = hasManualIncident ? 'Active System Incident' : 'Major System Outage';
		} else if (!allUp && checkedServices.length > 0) {
			overallStatus = 'degraded';
			overallStatusText = 'Partial System Outage';
		} else {
			overallStatus = 'up';
			overallStatusText = 'All Systems Operational';
		}

		return json({
			services: servicesWithHistory,
			historicalIncidents: historicalIncidents.results,
			manualIncidents: manualIncidents.results,
			system: { history: systemHistory.results, uptime: systemUptime },
			overall: { status: overallStatus, text: overallStatusText },
		});
	}

	return html(
		renderStatusPage(servicesWithHistory, historicalIncidents.results, manualIncidents.results, {
			history: systemHistory.results,
			uptime: systemUptime,
		}),
	);
}

async function handleHealthCheck(env: Env): Promise<Response> {
	const { results: services } = await db.getAllServices(env);
	const { results: activeIncidents } = await db.getActiveIncidents(env);

	const checkedServices: { name: string; status: string; latency_ms: number | null }[] = [];
	for (const service of services) {
		const { results: checks } = await env.status_db
			.prepare('SELECT status, latency_ms FROM health_checks WHERE service_id = ? ORDER BY timestamp DESC LIMIT 1')
			.bind(service.id)
			.all<{ status: string; latency_ms: number | null }>();
		checkedServices.push({
			name: service.name,
			status: checks[0]?.status ?? 'unknown',
			latency_ms: checks[0]?.latency_ms ?? null,
		});
	}

	const healthy = checkedServices.filter((s) => s.status === 'up');
	const degraded = checkedServices.filter((s) => s.status !== 'up' && s.status !== 'unknown');
	const unknown = checkedServices.filter((s) => s.status === 'unknown');

	let status: string;
	let statusCode: number;
	if (activeIncidents.length > 0 || degraded.length === checkedServices.length) {
		status = 'down';
		statusCode = 503;
	} else if (degraded.length > 0) {
		status = 'degraded';
		statusCode = 200;
	} else {
		status = 'up';
		statusCode = 200;
	}

	return new Response(
		JSON.stringify(
			{
				status,
				services: {
					total: checkedServices.length,
					healthy: healthy.length,
					degraded: degraded.length,
					unknown: unknown.length,
				},
				incidents: activeIncidents.length,
				checked: checkedServices,
			},
			null,
			2,
		),
		{
			status: statusCode,
			headers: { 'Content-Type': 'application/json', ...corsHeaders() },
		},
	);
}

async function handleAdmin(env: Env, request: Request, url: URL, path: string): Promise<Response | null> {
	if (!path.startsWith('/admin')) return null;

	const adminPath = path.replace(/\/$/, '');
	const oidcConfigured = !!(env.AUTHELIA_ISSUER && env.AUTHELIA_CLIENT_ID);

	// Public admin routes (no auth required)
	if (adminPath === '/admin/login' && request.method === 'POST') {
		return admin.handlePasswordLogin(env, await request.formData());
	}
	if (adminPath === '/admin/login/oidc') {
		const authUrl =
			`${env.AUTHELIA_ISSUER}/api/oidc/authorization?` +
			new URLSearchParams({
				client_id: env.AUTHELIA_CLIENT_ID,
				response_type: 'code',
				scope: 'openid profile email',
				redirect_uri: env.OIDC_REDIRECT_URI,
				state: crypto.randomUUID(),
			});
		return redirect(authUrl);
	}
	if (adminPath === '/admin/logout') {
		return new Response(null, { status: 302, headers: { Location: '/admin', 'Set-Cookie': clearSessionCookie() } });
	}
	if (adminPath === '/admin/callback') {
		const code = url.searchParams.get('code');
		if (!code) return new Response('Bad Request', { status: 400 });
		return admin.handleOidcCallback(env, code);
	}

	// Authenticated routes
	const authPayload = (await isAuthenticated(request, env)) as { sub: string } | null;
	if (!authPayload) {
		return html(renderAdminPage([], [], undefined, undefined, false, oidcConfigured));
	}

	if (request.method === 'POST') {
		const formData = await request.formData();
		if (adminPath === '/admin/notifications/toggle') return admin.handleToggleNotifications(env, formData, authPayload.sub);
		if (adminPath === '/admin/add') return admin.handleAddService(env, formData);
		if (adminPath === '/admin/remove') return admin.handleRemoveService(env, formData);
		if (adminPath === '/admin/incidents/create') return admin.handleCreateIncident(env, formData);
		if (adminPath === '/admin/incidents/resolve') return admin.handleResolveIncident(env, formData);
	}

	// Admin dashboard render
	const [services, activeIncidents, user] = await Promise.all([
		db.getAllServices(env),
		db.getActiveIncidents(env),
		db.getUserByEmail(env, authPayload.sub),
	]);

	return html(renderAdminPage(services.results, activeIncidents.results, user ?? undefined, undefined, true, oidcConfigured));
}

export default {
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const statusChanges = await db.performAllHealthChecks(env);
		if (statusChanges.length > 0) ctx.waitUntil(notifyStatusChanges(env, statusChanges));
	},

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		return (
			(await handleBadge(env, url, path)) ??
			(path === '/api/check' ? await handleApiCheck(env, ctx) : null) ??
			(path === '/api/health' ? await handleHealthCheck(env) : null) ??
			(await handleServiceDetail(env, path)) ??
			(await handleStatusPage(env, path)) ??
			(await handleAdmin(env, request, url, path)) ??
			notFound()
		);
	},
} satisfies ExportedHandler<Env>;
