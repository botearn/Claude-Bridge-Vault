import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'vault_admin';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // Misconfigured — block everything except login
    if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'ADMIN_SECRET not configured' }, { status: 503 });
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const authenticated = cookie === secret;

  if (authenticated) return NextResponse.next();

  // Unauthenticated: API routes → 401, pages → redirect to /login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Protect all manage API endpoints
    '/api/v1/manage/:path*',
    // Protect dashboard pages (not /login, not /api/auth/*)
    '/vault',
    '/query',
    '/settings',
    '/analytics',
  ],
};
