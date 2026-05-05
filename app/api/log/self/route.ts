import { NextRequest, NextResponse } from 'next/server';
import { getCompatUsageLogList } from '@/lib/console-usage-log-compat';
import { requireCompatSession, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const data = await getCompatUsageLogList(req.nextUrl.searchParams, session, true);
  return NextResponse.json(data);
}
