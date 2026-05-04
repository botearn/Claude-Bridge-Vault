import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { redis } from '@/lib/redis';
import { createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';
import type { UserData } from '@/lib/types';

export async function POST(req: NextRequest) {
  let username = '';
  let password = '';

  try {
    const body = await req.json();
    username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ success: false, message: 'Username and password are required' }, { status: 400 });
  }

  const raw = await redis.hget<string>('vault:users', username);
  if (!raw) {
    return NextResponse.json({ success: false, message: 'Invalid username or password' }, { status: 401 });
  }

  let user: UserData;
  try {
    user = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as UserData);
  } catch {
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ success: false, message: 'Invalid username or password' }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    success: true,
    message: 'OK',
    data: {
      id: Number(user.id) || 1,
    },
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
