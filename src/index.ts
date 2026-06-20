import { renderStatusPage } from './pages/StatusPage';
import { renderAdminPage } from './pages/AdminPage';
import { renderServiceDetailPage } from './pages/ServiceDetailPage';
import { Env, Service, StatusChange } from './types';
import { isAuthenticated } from './utils/auth';
import { generateBadgeSvg, getBadgeStatus } from './utils/badge';
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
	const width = url.searchParams.get('w') || '512';
	const height = url.searchParams.get('h') || width;

	const status = await getBadgeStatus(env, serviceName);
	const svg = generateBadgeSvg(status, width, height);

	if (isPng) {
		try {
			const png = await svgToPng(svg, parseInt(width), parseInt(height), resvgWasm);
			return new Response(new Uint8Array(png), {
				headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60', ...corsHeaders() },
			});
		} catch (e: unknown) {
			return new Response(`Error generating PNG: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
		}
	}

	return new Response(svg, {
		headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache, no-store, must-revalidate', ...corsHeaders() },
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
		return json({
			services: servicesWithHistory,
			historicalIncidents: historicalIncidents.results,
			manualIncidents: manualIncidents.results,
			system: { history: systemHistory.results, uptime: systemUptime },
		});
	}

	return html(
		renderStatusPage(servicesWithHistory, historicalIncidents.results, manualIncidents.results, {
			history: systemHistory.results,
			uptime: systemUptime,
		}),
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
			(await handleServiceDetail(env, path)) ??
			(await handleStatusPage(env, path)) ??
			(await handleAdmin(env, request, url, path)) ??
			notFound()
		);
	},
} satisfies ExportedHandler<Env>;
