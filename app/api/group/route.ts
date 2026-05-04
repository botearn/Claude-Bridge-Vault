import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { redis } from '@/lib/redis';
import type { SubKeyData } from '@/lib/types';

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
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const rawKeys = (await redis.hgetall<Record<string, string>>('vault:subkeys')) ?? {};
  const groups = Array.from(
    new Set(
      Object.values(rawKeys)
        .map(parseSafe)
        .filter((v): v is SubKeyData => v !== null)
        .map((v) => v.group)
        .filter(Boolean)
    )
  );

  return NextResponse.json({
    success: true,
    data: groups,
  });
}
