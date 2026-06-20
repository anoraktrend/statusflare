import { Env } from '../types';
import { redirect, html } from '../utils/response';
import { createSessionJwt, sessionCookie } from './session';
import { hashPassword } from '../utils/auth';
import { renderAdminPage } from '../pages/AdminPage';
import * as db from './db';
import { sendEmail, sendDiscordNotification } from '../utils/notifications';
import { decodeJwt } from 'jose';
// @ts-expect-error Missing types
import sanitize from 'sanitize';

export async function handlePasswordLogin(env: Env, formData: FormData) {
	const password = formData.get('password') as string;
	if (!env.ADMIN_PASSWORD_HASH) {
		return html(renderAdminPage([], [], undefined, 'Admin password not configured', false, true));
	}

	const enteredHash = await hashPassword(password);
	if (enteredHash !== env.ADMIN_PASSWORD_HASH) {
		return html(renderAdminPage([], [], undefined, 'Invalid Password', false, true));
	}

	const token = await createSessionJwt(env, 'admin', '1h');
	return new Response(null, {
		status: 302,
		headers: { Location: '/admin', 'Set-Cookie': sessionCookie(token, 3600) },
	});
}

export async function handleOidcCallback(env: Env, code: string) {
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
			return html(renderAdminPage([], [], undefined, `Token exchange failed: ${await tokenRes.text()}`, false, true));
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
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		return html(renderAdminPage([], [], undefined, `Callback error: ${msg}`, false, true));
	}
}

export async function handleToggleNotifications(env: Env, formData: FormData, email: string) {
	const enabled = formData.get('enabled') === '1' ? 1 : 0;
	await db.updateNotificationPref(env, email, enabled);
	return redirect('/admin');
}

export async function handleAddService(env: Env, formData: FormData) {
	const sanitizeValue = (name: string) => sanitize.value(formData.get(name) as string, 'string') || null;
	const data = {
		name: sanitize.value(formData.get('name') as string, 'string'),
		url: sanitize.value(formData.get('url') as string, 'string'),
		health_endpoint: sanitize.value(formData.get('health_endpoint') as string, 'string'),
		method: sanitize.value(formData.get('method') as string, 'string') || 'GET',
		headers_json: sanitizeValue('headers_json'),
		body: sanitizeValue('body'),
		token_url: sanitizeValue('token_url'),
		token_body: sanitizeValue('token_body'),
		token_response_path: sanitizeValue('token_response_path'),
		icon: sanitizeValue('icon'),
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
	const title = sanitize.value(formData.get('title') as string, 'string');
	const message = sanitize.value(formData.get('message') as string, 'string');
	const service_id = (formData.get('service_id') as string) || null;

	await db.createIncident(env, title, message, service_id);

	let serviceName = 'System Wide';
	if (service_id) {
		const service = await db.getServiceName(env, service_id);
		if (service) serviceName = service.name;
	}

	await sendEmail(
		env,
		`[StatusFlare] NEW INCIDENT: ${title}`,
		`Incident: ${title}\nAffected Service: ${serviceName}\nMessage: ${message}\nTime: ${new Date().toISOString()}`,
	);
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

	if (incident) {
		const subject = `[StatusFlare] RESOLVED: ${incident.title}`;
		const text = `Incident "${incident.title}" for ${incident.service_name || 'System Wide'} has been resolved.\nTime: ${new Date().toISOString()}`;
		await sendEmail(env, subject, text);
		await sendDiscordNotification(
			env,
			`✅ RESOLVED: ${incident.title}`,
			`The incident for **${incident.service_name || 'System Wide'}** has been resolved.`,
			0x57f287,
		);
	}

	return redirect('/admin');
}
