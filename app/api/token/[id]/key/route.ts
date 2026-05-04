import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatTokens,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const index = Number(id) - 1;
  const token = (await loadCompatTokens())[index];

  if (!token) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  if (session.role !== 'admin' && token.key.userId !== session.userId) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: {
      key: token.storedKey,
    },
  });
}
