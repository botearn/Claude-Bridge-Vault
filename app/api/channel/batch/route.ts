import { NextRequest, NextResponse } from 'next/server';
import {
  getCompatChannelById,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';
import { deleteChannel } from '@/lib/channels';

export async function POST(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  let deleted = 0;

  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isFinite(id)) continue;
    const entry = await getCompatChannelById(id);
    if (!entry) continue;
    await deleteChannel(entry.channel.vendor, entry.channel.id);
    deleted += 1;
  }

  return NextResponse.json({
    success: true,
    data: deleted,
  });
}
