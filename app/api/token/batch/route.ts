import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatTokenById,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  let deleted = 0;

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) continue;

    const entry = await getCompatTokenById(id);
    if (!entry) continue;

    if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
      continue;
    }

    await redis.hdel('vault:subkeys', entry.token.storedKey);
    deleted += 1;
  }

  return NextResponse.json({
    success: true,
    data: deleted,
  });
}
