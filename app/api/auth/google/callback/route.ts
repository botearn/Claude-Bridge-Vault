import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';
import type { UserData } from '@/lib/types';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') || '/vault';
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam || !code) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', errorParam || 'no_code');
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/login?error=oauth_not_configured', req.url));
  }

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  // Exchange code for tokens
  let tokens: GoogleTokenResponse;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      console.error('Google token exchange failed', await tokenRes.text());
      return NextResponse.redirect(new URL('/login?error=token_exchange', req.url));
    }
    tokens = await tokenRes.json();
  } catch (err) {
    console.error('Google token exchange error', err);
    return NextResponse.redirect(new URL('/login?error=token_exchange', req.url));
  }

  // Get user info
  let googleUser: GoogleUserInfo;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      console.error('Google userinfo failed', await userRes.text());
      return NextResponse.redirect(new URL('/login?error=userinfo', req.url));
    }
    googleUser = await userRes.json();
  } catch (err) {
    console.error('Google userinfo error', err);
    return NextResponse.redirect(new URL('/login?error=userinfo', req.url));
  }

  if (!googleUser.email) {
    return NextResponse.redirect(new URL('/login?error=no_email', req.url));
  }

  const email = googleUser.email.toLowerCase();

  // Find or create user
  const existing = await redis.hget<string>('vault:users', email);
  let user: UserData;

  if (existing) {
    // Existing user — parse and log them in
    user = typeof existing === 'string' ? JSON.parse(existing) : (existing as unknown as UserData);
  } else {
    // New user — first user = admin
    const allUsers = await redis.hlen('vault:users');
    const role = allUsers === 0 ? 'admin' : 'user';
    const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    user = {
      id,
      email,
      name: googleUser.name || email.split('@')[0],
      passwordHash: '', // no password for Google users
      role,
      createdAt: new Date().toISOString(),
    };

    await redis.hset('vault:users', { [email]: JSON.stringify(user) });
  }

  // Issue session
  const sessionToken = await createSessionToken(user);
  const redirectUrl = new URL(state, req.url);
  const res = NextResponse.redirect(redirectUrl);

  res.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // lax needed for OAuth redirect
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return res;
}
