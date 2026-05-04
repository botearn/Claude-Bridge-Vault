import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import type { UserData } from '@/lib/types';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const rawUsers = (await redis.hgetall<Record<string, string>>('vault:users')) ?? {};
  const items = Object.values(rawUsers)
    .map((v) => {
      try {
        return typeof v === 'string' ? (JSON.parse(v) as UserData) : (v as unknown as UserData);
      } catch {
        return null;
      }
    })
    .filter((u): u is UserData => u !== null)
    .map((user, idx) => ({
      id: idx + 1,
      user_id: Number(user.id) || idx + 1,
      username: user.email,
      model_name: 'all',
      created_at: new Date(user.createdAt).getTime(),
      token_used: 0,
      count: 0,
      quota: 0,
    }));

  return NextResponse.json({
    success: true,
    data: items,
  });
}
