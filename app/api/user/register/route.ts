import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { redis } from '@/lib/redis';
import type { UserData } from '@/lib/types';

export async function POST(req: NextRequest) {
  let email = '';
  let password = '';
  let name = '';

  try {
    const body = await req.json();
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body?.password === 'string' ? body.password : '';
    name = typeof body?.name === 'string' ? body.name.trim() : '';
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }

  if (!email || !password || !name) {
    return NextResponse.json(
      { success: false, message: 'Email, password and name are required' },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { success: false, message: 'Password must be at least 6 characters' },
      { status: 400 },
    );
  }

  const existing = await redis.hget('vault:users', email);
  if (existing) {
    return NextResponse.json({ success: false, message: 'Email already registered' }, { status: 409 });
  }

  const ADMIN_EMAILS = new Set([
    'yuqingchen02@gmail.com',
    'nicole.chen@sitesfy.ai',
    'steve@sitesfy.ai',
  ]);

  const user: UserData = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    role: ADMIN_EMAILS.has(email) ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  };

  await redis.hset('vault:users', { [email]: JSON.stringify(user) });

  return NextResponse.json(
    {
      success: true,
      message: 'OK',
      data: {
        id: Number(user.id) || 1,
      },
    },
    { status: 201 },
  );
}
