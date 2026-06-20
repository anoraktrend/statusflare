import * as jose from 'jose';
import { Env } from '../types';

function getSecret(env: Env) {
	return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function createSessionJwt(env: Env, sub: string, expiresIn = '2h'): Promise<string> {
	return new jose.SignJWT({ sub })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(getSecret(env));
}

export function sessionCookie(token: string, maxAge: number): string {
	return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
	return 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}
