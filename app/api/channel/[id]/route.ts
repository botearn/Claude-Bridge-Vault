import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatChannels,
  mapCompatChannel,
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
  const index = Number(id) - 1;
  const channels = await loadCompatChannels();
  const channel = channels[index];

  if (!channel) {
    return NextResponse.json({ success: false, message: 'Channel not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: mapCompatChannel(channel, index),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }
  return notImplemented();
}
