import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'vault_session';
const LEGACY_COOKIE = 'vault_admin';

function getSecret() {
  const raw = process.env.JWT_SECRET || process.env.ADMIN_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

async function isAuthenticated(req: NextRequest): Promise<boolean> {
  // 1) JWT session cookie
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const secret = getSecret();
    if (secret) {
      try {
        await jwtVerify(token, secret);
        return true;
      } catch { /* invalid token */ }
    }
  }

  // 2) Legacy ADMIN_SECRET cookie (backward compat)
  const legacy = req.cookies.get(LEGACY_COOKIE)?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  if (legacy && adminSecret && legacy === adminSecret) {
    return true;
  }

  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth routes and login page
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const authed = await isAuthenticated(req);
  if (authed) return NextResponse.next();

  // Unauthenticated
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/api/v1/manage/:path*',
    '/vault',
    '/query',
    '/settings',
    '/analytics',
    '/monitoring',
    '/playground',
    '/logs',
  ],
};
