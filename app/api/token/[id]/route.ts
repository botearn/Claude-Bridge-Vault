import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatTokens,
  mapCompatToken,
  requireCompatSession,
  unauthorized,
} from '@/lib/console-compat';

function notImplemented() {
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const index = Number(id) - 1;
  const isAdmin = session.role === 'admin';
  const token = (await loadCompatTokens())[index];

  if (!token) {
    return NextResponse.json({ success: false, message: 'Token not found' }, { status: 404 });
  }

  const item = mapCompatToken(token.storedKey, token.key, index, isAdmin, session);
  if (!item) {
    return unauthorized();
  }

  return NextResponse.json({
    success: true,
    data: item,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCompatSession(req);
  if (!session) {
    return unauthorized();
  }
  return notImplemented();
}
