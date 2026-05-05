import { NextRequest, NextResponse } from 'next/server';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: [],
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    message: 'Bindings are not implemented in compatibility mode yet',
  });
}
