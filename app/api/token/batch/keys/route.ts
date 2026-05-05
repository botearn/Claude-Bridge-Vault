import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatTokenById,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';

export async function POST(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const keys: Record<number, string> = {};

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) continue;

    const entry = await getCompatTokenById(id);
    if (!entry) continue;

    if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
      continue;
    }

    keys[id] = entry.token.storedKey;
  }

  return NextResponse.json({
    success: true,
    data: { keys },
  });
}
