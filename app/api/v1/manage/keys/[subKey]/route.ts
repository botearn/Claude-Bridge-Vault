import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { VENDOR_CONFIG } from '@/lib/vendors';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import type { SubKeyData, SubKeyRecord } from '@/lib/types';

type RouteContext = {
  params: Promise<{ subKey: string }>;
};

const parseKeyRecord = (value: string | Record<string, unknown> | null): SubKeyData | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SubKeyData;
    } catch {
      return null;
    }
  }
  return value as unknown as SubKeyData;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { subKey } = await context.params;
  if (!subKey) return NextResponse.json({ error: 'subKey is required' }, { status: 400 });

  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    const payload = await req.json();
    const rawValue = await redis.hget('vault:subkeys', subKey);
    const keyData = parseKeyRecord(rawValue as string | Record<string, unknown> | null);
    if (!keyData) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

    // Ownership check
    if (session?.role !== 'admin' && keyData.userId !== session?.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated: SubKeyData = {
      ...keyData,
      name: typeof payload.name === 'string' ? payload.name.trim() : keyData.name,
      group: typeof payload.group === 'string' && payload.group.trim() ? payload.group.trim() : keyData.group,
      totalQuota: payload.totalQuota === null ? null : typeof payload.totalQuota === 'number' ? Math.floor(payload.totalQuota) : keyData.totalQuota,
      expiresAt: payload.expiresAt === null ? null : typeof payload.expiresAt === 'string' && payload.expiresAt ? payload.expiresAt : keyData.expiresAt,
      model: payload.model === null ? undefined : typeof payload.model === 'string' ? payload.model : keyData.model,
      budgetUsd: payload.budgetUsd === null ? null : typeof payload.budgetUsd === 'number' ? payload.budgetUsd : keyData.budgetUsd,
    };

    await redis.hset('vault:subkeys', { [subKey]: JSON.stringify(updated) });
    return NextResponse.json({ key: subKey, ...updated });
  } catch (error) {
    console.error('Failed to update sub-key', error);
    return NextResponse.json({ error: 'Unable to update key' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { subKey } = await context.params;

  if (!subKey) {
    return NextResponse.json({ error: 'subKey is required' }, { status: 400 });
  }

  try {
    const rawValue = await redis.hget('vault:subkeys', subKey);
    const keyData = parseKeyRecord(rawValue as string | Record<string, unknown> | null);

    if (!keyData) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    const config = VENDOR_CONFIG[keyData.vendor];
    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '') + config.basePath;

    const record: SubKeyRecord = {
      key: subKey,
      baseUrl,
      ...keyData,
    };

    return NextResponse.json(record);
  } catch (error) {
    console.error('Failed to fetch sub-key', error);
    return NextResponse.json({ error: 'Vault datastore unavailable' }, { status: 500 });
  }
}
