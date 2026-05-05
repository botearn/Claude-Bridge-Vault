import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatTokenById,
  mapCompatToken,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const isAdmin = session.role === 'admin';
  const entry = await getCompatTokenById(Number(id));

  if (!entry) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  const item = mapCompatToken(entry.token.storedKey, entry.token.key, entry.index, isAdmin, session);
  if (!item) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: item,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const id = Number(req.nextUrl.pathname.split('/').filter(Boolean).pop());
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid token id' }, { status: 400 });
  }

  const entry = await getCompatTokenById(id);
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
    return unauthorized();
  }

  await redis.hdel('vault:subkeys', entry.token.storedKey);
  return NextResponse.json({ success: true, message: 'OK' });
}
