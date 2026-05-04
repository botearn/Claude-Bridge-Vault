import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import type { SubKeyData } from '@/lib/types';

function toTs(dateLike?: string | null): number {
  if (!dateLike) return 0;
  const ts = new Date(dateLike).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function parseSafe(v: unknown): SubKeyData | null {
  if (!v) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as SubKeyData;
    } catch {
      return null;
    }
  }
  return v as SubKeyData;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const rawKeys = (await redis.hgetall<Record<string, string>>('vault:subkeys')) ?? {};
  const items = Object.values(rawKeys)
    .map(parseSafe)
    .filter((v): v is SubKeyData => v !== null)
    .map((key, idx) => ({
      id: idx + 1,
      user_id: Number(key.userId) || idx + 1,
      username: key.userId || key.name,
      model_name: key.model || key.vendor,
      created_at: toTs(key.lastUsed || key.createdAt),
      token_used: (key.inputTokens || 0) + (key.outputTokens || 0),
      count: key.usage || 0,
      quota: Math.round((key.costUsd || 0) * 500000),
    }))
    .filter((item) => item.count > 0 || item.token_used > 0 || item.quota > 0);

  return NextResponse.json({
    success: true,
    data: items,
  });
}
