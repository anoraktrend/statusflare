import * as jose from 'jose';
import { Env } from '../types';

export async function isAuthenticated(request: Request, env: Env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...value] = cookie.trim().split('=');
    if (name) acc[name] = value.join('=');
    return acc;
  }, {} as Record<string, string>);
  
  const sessionToken = cookies['session'];
  
  if (!sessionToken) return false;
  
  try {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);
    const { payload } = await jose.jwtVerify(sessionToken, secret);
    return payload;
  } catch (e: any) {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
