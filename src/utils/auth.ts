import * as jose from 'jose';
import { Env } from '../types';
import { cookies } from './helpers';

export async function isAuthenticated(request: Request, env: Env) {
	const sessionToken = cookies(request.headers.get('Cookie') || '')['session'];

	if (!sessionToken) return false;

	try {
		const secret = new TextEncoder().encode(env.SESSION_SECRET);
		const { payload } = await jose.jwtVerify(sessionToken, secret);
		return payload;
	} catch {
		return false;
	}
}

export async function hashPassword(password: string): Promise<string> {
	const msgUint8 = new TextEncoder().encode(password);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
