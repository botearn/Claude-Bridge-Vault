import { NextRequest, NextResponse } from 'next/server';
import {
  loadCompatChannels,
  requireCompatAdmin,
  unauthorized,
} from '@/lib/console-compat';

export async function GET(req: NextRequest) {
  const session = await requireCompatAdmin(req);
  if (!session) {
    return unauthorized();
  }

  const models = Array.from(
    new Set(
      (await loadCompatChannels())
        .filter((channel) => channel.enabled)
        .flatMap((channel) =>
          String(channel.models || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        )
    )
  );

  return NextResponse.json({
    success: true,
    data: models,
  });
}
