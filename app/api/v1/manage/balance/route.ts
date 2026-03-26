import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getBalance, addBalance } from '@/lib/balance';

/** GET /api/v1/manage/balance — get current user's balance */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const balance = await getBalance(session.userId);
  return NextResponse.json({ userId: session.userId, balanceUsd: balance });
}

/** POST /api/v1/manage/balance — top up balance (admin only) */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let targetUserId: string, amountUsd: number;
  try {
    const body = await req.json();
    targetUserId = typeof body?.userId === 'string' ? body.userId : session.userId;
    amountUsd = typeof body?.amountUsd === 'number' ? body.amountUsd : 0;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (amountUsd <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  const newBalance = await addBalance(targetUserId, amountUsd);
  return NextResponse.json({ userId: targetUserId, balanceUsd: newBalance });
}
