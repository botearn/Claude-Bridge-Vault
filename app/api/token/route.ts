import { NextRequest, NextResponse } from 'next/server';
import {
  compatPayloadToSubKeyRecord,
  loadCompatTokens,
  mapCompatToken,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const p = Number(req.nextUrl.searchParams.get('p') ?? '1');
  const size = Number(req.nextUrl.searchParams.get('size') ?? '10');
  const isAdmin = session.role === 'admin';

  const items = (await loadCompatTokens())
    .map(({ storedKey, key }, idx) => mapCompatToken(storedKey, key, idx, isAdmin, session))
    .filter((item) => item !== null);

  const page = Math.max(1, p);
  const pageSize = Math.max(1, size);
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return NextResponse.json({
    success: true,
    data: {
      items: paged,
      total: items.length,
      page,
      page_size: pageSize,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const record = compatPayloadToSubKeyRecord(body, session.userId);
  const randomId = Math.random().toString(36).slice(2, 10);
  const subKey = `sk-vault-${record.vendor}-${randomId}`;

  await redis.hset('vault:subkeys', {
    [subKey]: JSON.stringify(record),
  });

  const tokens = await loadCompatTokens();
  const index = tokens.findIndex((item) => item.storedKey === subKey);
  const item = mapCompatToken(subKey, record, index, true, session);

  return NextResponse.json({
    success: true,
    data: item,
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, message: 'Invalid token id' }, { status: 400 });
  }

  const index = id - 1;
  const entries = await loadCompatTokens();
  const entry = entries[index];

  if (!entry) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  if (session.role !== 'admin' && entry.key.userId !== session.userId) {
    return unauthorized();
  }

  const next =
    req.nextUrl.searchParams.get('status_only') === 'true'
      ? {
          ...entry.key,
          expiresAt: Number(body?.status) === 2 ? new Date(0).toISOString() : entry.key.expiresAt,
        }
      : compatPayloadToSubKeyRecord(body, entry.key.userId, entry.key);

  await redis.hset('vault:subkeys', {
    [entry.storedKey]: JSON.stringify(next),
  });

  return NextResponse.json({
    success: true,
    data: mapCompatToken(entry.storedKey, next, index, true, session),
  });
}
