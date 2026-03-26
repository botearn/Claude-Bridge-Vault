import { SignJWT, jwtVerify } from 'jose';
import type { UserData } from './types';

const COOKIE_NAME = 'vault_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export { COOKIE_NAME, COOKIE_MAX_AGE };

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

function getSecret() {
  const raw = process.env.JWT_SECRET || process.env.ADMIN_SECRET;
  if (!raw) throw new Error('JWT_SECRET or ADMIN_SECRET must be set');
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(user: UserData): Promise<string> {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
