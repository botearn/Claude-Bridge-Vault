import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatChannelById,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const entry = await getCompatChannelById(Number(id));
  if (!entry) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    balance: 0,
    currency: 'USD',
    message: 'Balance query is not implemented in compatibility mode yet',
  });
}
