import { NextRequest, NextResponse } from 'next/server';
import { getCompatUsageLogList } from '@/lib/console-usage-log-compat';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const data = await getCompatUsageLogList(req.nextUrl.searchParams, session, false);
  return NextResponse.json(data);
}
