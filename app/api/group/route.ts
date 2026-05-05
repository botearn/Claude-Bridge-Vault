import { NextRequest, NextResponse } from 'next/server';
import { requireCompatSession, unauthorized } from '@/lib/console-compat';
import { redis } from '@/lib/redis';
import type { SubKeyData, UserData } from '@/lib/types';

function parseSafeSubKey(v: unknown): SubKeyData | null {
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

function parseSafeUser(v: unknown): UserData | null {
  if (!v) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as UserData;
    } catch {
      return null;
    }
  }
  return v as UserData;
}

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const rawKeys = (await redis.hgetall<Record<string, string>>('vault:subkeys')) ?? {};
  const rawUsers = (await redis.hgetall<Record<string, string>>('vault:users')) ?? {};
  const groups = new Set<string>(
    Object.values(rawUsers)
      .map(parseSafeUser)
      .filter((v): v is UserData => v !== null)
      .map((v) => (v.role === 'admin' ? 'admin' : 'default'))
      .filter(Boolean)
  );

  for (const group of Object.values(rawKeys)
    .map(parseSafeSubKey)
    .filter((v): v is SubKeyData => v !== null)
    .map((v) => v.group)
    .filter(Boolean)) {
    groups.add(group);
  }

  return NextResponse.json({
    success: true,
    data: Array.from(groups),
  });
}
