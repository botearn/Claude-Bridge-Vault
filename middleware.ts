import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'vault_session';
const LEGACY_COOKIE = 'vault_admin';

function getSecret() {
  const raw = process.env.JWT_SECRET || process.env.ADMIN_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

interface AuthResult {
  authenticated: boolean;
  role?: string;
}

async function checkAuth(req: NextRequest): Promise<AuthResult> {
  // 1) JWT session cookie
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const secret = getSecret();
    if (secret) {
      try {
        const { payload } = await jwtVerify(token, secret);
        return { authenticated: true, role: (payload as { role?: string }).role };
      } catch { /* invalid token */ }
    }
  }

  // 2) Legacy ADMIN_SECRET cookie (backward compat)
  const legacy = req.cookies.get(LEGACY_COOKIE)?.value;
  const adminSecret = process.env.ADMIN_SECRET;
  if (legacy && adminSecret && legacy === adminSecret) {
    return { authenticated: true, role: 'admin' };
  }

  return { authenticated: false };
}

// Pages that require admin role
const ADMIN_ONLY_PAGES = ['/channels', '/analytics', '/monitoring'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow auth routes and login page
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const { authenticated, role } = await checkAuth(req);

  if (!authenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only pages: redirect non-admins to /vault
  if (ADMIN_ONLY_PAGES.some(p => pathname === p) && role !== 'admin') {
    return NextResponse.redirect(new URL('/vault', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/v1/manage/:path*',
    '/vault',
    '/query',
    '/settings',
    '/analytics',
    '/monitoring',
    '/channels',
    '/playground',
    '/logs',
  ],
};
