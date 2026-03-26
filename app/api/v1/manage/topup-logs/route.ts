import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { redis } from '@/lib/redis';

/** GET /api/v1/manage/topup-logs?limit=50&offset=0
 * Admin: all logs. User: own logs only.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10));
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);

  const raw = await redis.lrange<string>('vault:topup:logs', offset, offset + limit - 1);
  const logs = raw
    .map(r => { try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; } })
    .filter(Boolean);

  // Non-admin can only see their own records
  const filtered = session.role === 'admin'
    ? logs
    : logs.filter((l: Record<string, unknown>) => l.targetUserId === session.userId);

  return NextResponse.json({ logs: filtered });
}
