import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  getCompatUserById,
  loadCompatUsers,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';
import type { UserData } from '@/lib/types';

export async function GET(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const pageSize = Number(req.nextUrl.searchParams.get('page_size') ?? '10');
  const users = (await loadCompatUsers()).map((user, index) =>
    mapCompatUser(user, index)
  );

  const page = Math.max(1, p);
  const size = Math.max(1, pageSize);
  const start = (page - 1) * size;

  return NextResponse.json({
    success: true,
    data: {
      items: users.slice(start, start + size),
      total: users.length,
      page,
      page_size: size,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name =
    typeof body?.display_name === 'string' && body.display_name.trim()
      ? body.display_name.trim()
      : email;
  const role = Number(body?.role) >= 10 ? 'admin' : 'user';

  if (!email || !password) {
    return NextResponse.json(
      { success: false, message: 'Username and password are required' },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { success: false, message: 'Password must be at least 6 characters' },
      { status: 400 }
    );
  }

  const existing = await redis.hget('vault:users', email);
  if (existing) {
    return NextResponse.json(
      { success: false, message: 'User already exists' },
      { status: 409 }
    );
  }

  const user: UserData = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    email,
    name,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    createdAt: new Date().toISOString(),
  };

  await redis.hset('vault:users', { [email]: JSON.stringify(user) });

  const users = await loadCompatUsers();
  const index = users.findIndex((item) => item.email === email);

  return NextResponse.json({
    success: true,
    data: index >= 0 ? mapCompatUser(users[index], index) : undefined,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await requireCompatAdmin(req))) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid user id' }, { status: 400 });
  }

  const entry = await getCompatUserById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  const next: UserData = {
    ...entry.user,
    name:
      typeof body?.display_name === 'string' && body.display_name.trim()
        ? body.display_name.trim()
        : entry.user.name,
    role:
      typeof body?.role === 'number'
        ? body.role >= 10
          ? 'admin'
          : 'user'
        : entry.user.role,
  };

  if (typeof body?.password === 'string' && body.password) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    next.passwordHash = await bcrypt.hash(body.password, 10);
  }

  await redis.hset('vault:users', { [entry.user.email]: JSON.stringify(next) });

  const users = await loadCompatUsers();
  const index = users.findIndex((item) => item.email === entry.user.email);
  return NextResponse.json({
    success: true,
    data: index >= 0 ? mapCompatUser(users[index], index) : undefined,
  });
}
