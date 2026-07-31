import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runCatalogProbes } from '@/lib/model-probes';

export const maxDuration = 300;

function secretMatches(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const actual = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!secretMatches(actual, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runCatalogProbes());
  } catch (error) {
    console.error('BotEarn model probe failed', error);
    return NextResponse.json({ error: 'Model probe failed' }, { status: 500 });
  }
}
