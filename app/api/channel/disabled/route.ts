import { NextRequest, NextResponse } from 'next/server';
import { loadCompatChannels, requireCompatAdmin, unauthorized } from '@/lib/console-compat';
import { deleteChannel } from '@/lib/channels';

export async function DELETE(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const channels = await loadCompatChannels();
  const disabled = channels.filter((channel) => !channel.enabled || channel.health.circuitOpen);

  for (const channel of disabled) {
    await deleteChannel(channel.vendor, channel.id);
  }

  return NextResponse.json({
    success: true,
    data: disabled.length,
  });
}
