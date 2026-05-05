import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatChannelById,
  mapCompatChannel,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { deleteChannel } from '@/lib/channels';

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
    data: mapCompatChannel(entry.channel, entry.index),
  });
}

export async function DELETE(
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

  await deleteChannel(entry.channel.vendor, entry.channel.id);
  return NextResponse.json({ success: true, message: 'OK' });
}
