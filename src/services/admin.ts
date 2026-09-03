import { Env } from '../types';
import { redirect, html } from '../utils/response';
import { err } from '../utils/helpers';
import { createSessionJwt, sessionCookie } from './session';
import { hashPassword } from '../utils/auth';
import { renderAdminPage } from '../pages/AdminPage';
import * as db from './db';
import { sendEmail, sendDiscordNotification } from '../utils/notifications';
import { decodeJwt } from 'jose';

// Storage must keep raw values — HTML escaping is for display only (AdminPage.tsx JSX escapes).
// Previous sanitizeStr corrupted health_endpoint query strings (?a=1&b=2 -> &amp;) and
// headers_json quotes. Store trimmed raw strings instead.
function toNullableTrim(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const raw = String(value).trim();
	return raw === '' ? null : raw;
}

function toTrimmedString(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function isOidcConfigured(env: Env): boolean {
	return !!(env.AUTHELIA_ISSUER && env.AUTHELIA_CLIENT_ID && env.AUTHELIA_CLIENT_SECRET);
}

export async function handlePasswordLogin(env: Env, formData: FormData) {
	const password = formData.get('password') as string;
	if (!env.ADMIN_PASSWORD_HASH) {
		return html(renderAdminPage([], [], undefined, 'Admin password not configured', false, isOidcConfigured(env)));
	}

	const enteredHash = await hashPassword(password);
	if (enteredHash !== env.ADMIN_PASSWORD_HASH) {
		return html(renderAdminPage([], [], undefined, 'Invalid Password', false, isOidcConfigured(env)));
	}

	const token = await createSessionJwt(env, 'admin', '1h');
	return new Response(null, {
		status: 302,
		headers: { Location: '/admin', 'Set-Cookie': sessionCookie(token, 3600) },
	});
}

export async function handleOidcCallback(env: Env, code: string) {
	if (!env.AUTHELIA_CLIENT_SECRET) {
		return html(renderAdminPage([], [], undefined, 'Authelia client secret not configured', false, isOidcConfigured(env)));
	}
	try {
		const tokenRes = await fetch(`${env.AUTHELIA_ISSUER}/api/oidc/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: env.OIDC_REDIRECT_URI,
				client_id: env.AUTHELIA_CLIENT_ID,
				client_secret: env.AUTHELIA_CLIENT_SECRET,
			}),
		});

		if (!tokenRes.ok) {
			return html(renderAdminPage([], [], undefined, `Token exchange failed: ${await tokenRes.text()}`, false, isOidcConfigured(env)));
		}

		const tokens = (await tokenRes.json()) as { id_token?: string; sub?: string };
		let email = 'admin';
		if (tokens.id_token) {
			const payload = decodeJwt(tokens.id_token);
			email = (payload.email as string) || (payload.sub as string);
		} else {
			email = tokens.sub || 'admin';
		}

		await db.registerUser(env, email);
		const token = await createSessionJwt(env, email);
		return new Response(null, {
			status: 302,
			headers: { Location: '/admin', 'Set-Cookie': sessionCookie(token, 7200) },
		});
	} catch (e) {
		return html(renderAdminPage([], [], undefined, `Callback error: ${err(e)}`, false, isOidcConfigured(env)));
	}
}

export async function handleToggleNotifications(env: Env, formData: FormData, email: string) {
	const enabled = formData.get('enabled') === '1' ? 1 : 0;
	await db.updateNotificationPref(env, email, enabled);
	return redirect('/admin');
}

export async function handleAddService(env: Env, formData: FormData) {
	const data = {
		name: toTrimmedString(formData.get('name')),
		url: toTrimmedString(formData.get('url')),
		health_endpoint: toTrimmedString(formData.get('health_endpoint')),
		method: toTrimmedString(formData.get('method')) || 'GET',
		headers_json: toNullableTrim(formData.get('headers_json')),
		body: toNullableTrim(formData.get('body')),
		token_url: toNullableTrim(formData.get('token_url')),
		token_body: toNullableTrim(formData.get('token_body')),
		token_response_path: toNullableTrim(formData.get('token_response_path')),
		icon: toNullableTrim(formData.get('icon')),
	};
	await db.addService(env, data);
	return redirect('/admin');
}

export async function handleRemoveService(env: Env, formData: FormData) {
	const id = formData.get('id') as string;
	await db.removeService(env, id);
	return redirect('/admin');
}

export async function handleCreateIncident(env: Env, formData: FormData) {
	const title = toTrimmedString(formData.get('title'));
	const message = toTrimmedString(formData.get('message'));
	const service_id = toNullableTrim(formData.get('service_id'));

	await db.createIncident(env, title, message, service_id);

	let serviceName = 'System Wide';
	if (service_id) {
		const service = await db.getServiceName(env, service_id);
		if (service) serviceName = service.name;
	}

	if (env.NOTIFICATION_EMAIL) {
		await sendEmail(
			env,
			env.NOTIFICATION_EMAIL,
			`[StatusFlare] NEW INCIDENT: ${title}`,
			`Incident: ${title}\nAffected Service: ${serviceName}\nMessage: ${message}\nTime: ${new Date().toISOString()}`,
		);
	}
	await sendDiscordNotification(
		env,
		`🚨 NEW INCIDENT: ${title}`,
		`**Affected Service:** ${serviceName}\n**Message:** ${message}`,
		0xfee75c,
	);

	return redirect('/admin');
}

export async function handleResolveIncident(env: Env, formData: FormData) {
	const id = formData.get('id') as string;

	const incident = await db.getIncidentWithService(env, id);
	await db.resolveIncident(env, id);

	if (incident && env.NOTIFICATION_EMAIL) {
		const subject = `[StatusFlare] RESOLVED: ${incident.title}`;
		const text = `Incident "${incident.title}" for ${incident.service_name || 'System Wide'} has been resolved.\nTime: ${new Date().toISOString()}`;
		await sendEmail(env, env.NOTIFICATION_EMAIL, subject, text);
		await sendDiscordNotification(
			env,
			`✅ RESOLVED: ${incident.title}`,
			`The incident for **${incident.service_name || 'System Wide'}** has been resolved.`,
			0x57f287,
		);
	}

	return redirect('/admin');
}
