import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { redis } from '@/lib/redis';
import { createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';
import type { UserData } from '@/lib/types';

export async function POST(req: NextRequest) {
  let email: string, password: string;
  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // Look up user by email
  const raw = await redis.hget<string>('vault:users', email);
  if (!raw) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  let user: UserData;
  try {
    user = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as UserData);
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return res;
}
