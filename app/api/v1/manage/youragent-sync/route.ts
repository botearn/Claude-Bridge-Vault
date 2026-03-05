import { NextResponse } from 'next/server';
import { fetchYASync, getYASync } from '@/lib/youragent-sync';

export async function POST() {
  const masterKey = process.env.YOURAGENT_MASTER_KEY?.split(',')[0].trim();
  if (!masterKey) {
    return NextResponse.json({ error: 'YOURAGENT_MASTER_KEY not configured' }, { status: 500 });
  }
  try {
    const data = await fetchYASync(masterKey);
    return NextResponse.json({ ok: true, syncedAt: data.syncedAt, totalCost: data.keyInfo.totalCost, totalTokens: data.total.allTokens });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function GET() {
  const data = await getYASync();
  if (!data) return NextResponse.json({ error: 'No sync data yet. Call POST to trigger sync.' }, { status: 404 });
  return NextResponse.json(data);
}
