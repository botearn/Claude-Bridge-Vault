import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET() {
  const keys = await redis.hgetall('vault_subkeys');
  return NextResponse.json(keys || {});
}

export async function POST(req: NextRequest) {
  const { name, track } = await req.json();
  const randomId = Math.random().toString(36).substring(2, 10);
  const subKey = `sk-vault-${track}-${randomId}`;
  
  const keyData = {
    name,
    track,
    usage: 0,
    createdAt: new Date().toISOString()
  };

  await redis.hset('vault_subkeys', { [subKey]: JSON.stringify(keyData) });
  return NextResponse.json({ subKey, ...keyData });
}
