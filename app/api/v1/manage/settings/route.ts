import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

const SETTINGS_KEY = 'vault:settings';
const CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const raw = await redis.hgetall<Record<string, string>>(SETTINGS_KEY);
  return NextResponse.json(raw ?? {}, { headers: CACHE_HEADERS });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json() as Record<string, unknown>;
  const updates: Record<string, string> = {};

  // Accept any string/number settings
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string' || typeof v === 'number') {
      updates[k] = String(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  await redis.hset(SETTINGS_KEY, updates);
  return NextResponse.json({ ok: true });
}
