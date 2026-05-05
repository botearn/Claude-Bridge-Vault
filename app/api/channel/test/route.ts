import { NextRequest, NextResponse } from 'next/server';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    message: 'Bulk test is not implemented in compatibility mode yet',
  });
}
