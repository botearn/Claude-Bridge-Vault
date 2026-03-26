import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { getUsageLogs } from '@/lib/usage-log';

/** GET /api/v1/manage/usage-logs?limit=100&offset=0&vendor=claude&subKey=xxxxx */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, parseInt(sp.get('limit') ?? '100', 10));
  const offset = parseInt(sp.get('offset') ?? '0', 10);
  const vendor = sp.get('vendor') ?? undefined;
  const subKey = sp.get('subKey') ?? undefined;

  const logs = await getUsageLogs({ limit, offset, vendor, subKey });

  // Non-admin: filter to own userId only
  const filtered = session.role === 'admin'
    ? logs
    : logs.filter(l => l.userId === session.userId);

  return NextResponse.json({ logs: filtered, count: filtered.length });
}
