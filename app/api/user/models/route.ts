import { NextRequest, NextResponse } from 'next/server';
import { requireCompatSession, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: ['claude-3-7-sonnet', 'claude-sonnet-4-20250514'],
  });
}
