import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatUserById,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';
import type { UserData } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
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

  const action = typeof body?.action === 'string' ? body.action : '';
  const next: UserData = { ...entry.user };

  if (action === 'promote') {
    next.role = 'admin';
  } else if (action === 'demote') {
    next.role = 'user';
  } else if (action === 'enable' || action === 'disable') {
    const status = action === 'disable' ? 2 : 1;
    return NextResponse.json({
      success: true,
      data: {
        ...mapCompatUser(entry.user, entry.index),
        status,
      },
    });
  } else if (action === 'delete') {
    await redis.hdel('vault:users', entry.user.email);
    return NextResponse.json({ success: true, message: 'OK' });
  } else if (action === 'add_quota') {
    const current = 0;
    const mode = typeof body?.mode === 'string' ? body.mode : 'add';
    const value = Number(body?.value) || 0;
    const quota =
      mode === 'override'
        ? value
        : mode === 'subtract'
          ? Math.max(0, current - value)
          : current + value;

    return NextResponse.json({
      success: true,
      data: {
        ...mapCompatUser(entry.user, entry.index),
        quota,
      },
    });
  } else {
    return NextResponse.json({ success: false, message: 'Unsupported action' }, { status: 400 });
  }

  await redis.hset('vault:users', { [entry.user.email]: JSON.stringify(next) });

  const refreshed = await getCompatUserById(id);
  return NextResponse.json({
    success: true,
    data: refreshed ? mapCompatUser(refreshed.user, refreshed.index) : undefined,
  });
}
