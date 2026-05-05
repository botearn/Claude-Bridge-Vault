import { NextRequest, NextResponse } from 'next/server';
import { requireCompatAdmin, unauthorized } from '@/lib/console-compat';

export async function DELETE(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    message: 'Built-in binding reset is not implemented in compatibility mode yet',
  });
}
