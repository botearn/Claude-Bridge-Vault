import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { redis } from '@/lib/redis';
import { createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';
import type { UserData } from '@/lib/types';

export async function POST(req: NextRequest) {
  let email: string, password: string, name: string;
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body?.password === 'string' ? body.password : '';
    name = typeof body?.name === 'string' ? body.name.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Email, password and name are required' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  // Check if email already registered
  const existing = await redis.hget('vault:users', email);
  if (existing) {
    await new Promise((r) => setTimeout(r, 300));
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  // Admin whitelist — only these emails get admin role
  const ADMIN_EMAILS = new Set([
    'yuqingchen02@gmail.com',
    'nicole.chen@sitesfy.ai',
    'steve@sitesfy.ai',
  ]);
  const role = ADMIN_EMAILS.has(email) ? 'admin' : 'user';

  const passwordHash = await bcrypt.hash(password, 10);
  const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const user: UserData = {
    id,
    email,
    name,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };

  await redis.hset('vault:users', { [email]: JSON.stringify(user) });

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  }, { status: 201 });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return res;
}
