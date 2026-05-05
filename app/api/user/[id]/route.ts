import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatUserById,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatUserById(Number(id));

  if (!entry) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: mapCompatUser(entry.user, entry.index),
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatUserById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  if (entry.user.role === 'admin' && entry.user.email === 'yuqingchen02@gmail.com') {
    return NextResponse.json({ success: false, message: 'Protected admin user cannot be deleted' }, { status: 403 });
  }

  await redis.hdel('vault:users', entry.user.email);
  return NextResponse.json({ success: true, message: 'OK' });
}
