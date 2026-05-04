import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatUsers,
  mapCompatUser,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

function notImplemented() {
  return NextResponse.json({ success: false, message: 'Not implemented in compatibility mode' }, { status: 501 });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const { id } = await context.params;
  const users = await loadCompatUsers();
  const user = users.find((item) => String(item.id) === id || String(Number(item.id) || 1) === id);

  if (!user) {
    return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: mapCompatUser(user),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }
  return notImplemented();
}
