import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getBalance, addBalance } from '@/lib/balance';
import { redis } from '@/lib/redis';
import type { UserData } from '@/lib/types';

/** GET /api/v1/manage/balance — get current user's balance */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const balance = await getBalance(session.userId);
  return NextResponse.json({ userId: session.userId, balanceUsd: balance });
}

/** POST /api/v1/manage/balance — top up balance (admin only)
 *  Body: { email: string, amountUsd: number }
 *    OR: { userId: string, amountUsd: number }  (legacy)
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let targetEmail: string | undefined;
  let targetUserId: string;
  let amountUsd: number;

  try {
    const body = await req.json();
    targetEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    targetUserId = typeof body?.userId === 'string' ? body.userId : '';
    amountUsd = typeof body?.amountUsd === 'number' ? body.amountUsd : 0;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Resolve userId from email if provided
  if (targetEmail) {
    const raw = await redis.hget<string>('vault:users', targetEmail);
    if (!raw) {
      return NextResponse.json({ error: `User not found: ${targetEmail}` }, { status: 404 });
    }
    const user: UserData = typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as UserData);
    targetUserId = user.id;
  }

  if (!targetUserId) {
    targetUserId = session.userId;
  }

  if (amountUsd <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const newBalance = await addBalance(targetUserId, amountUsd);
  return NextResponse.json({ userId: targetUserId, email: targetEmail, balanceUsd: newBalance });
}
