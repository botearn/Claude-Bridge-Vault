import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor } from '@/lib/vendors';
import type { SubKeyData } from '@/lib/types';

const parseKeyRecord = (value: string | Record<string, unknown> | null): SubKeyData | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SubKeyData;
    } catch (err) {
      console.error('Failed to parse stored key record', err);
      return null;
    }
  }
  return value as unknown as SubKeyData;
};

export async function GET(req: NextRequest) {
  try {
    const vendorFilter = req.nextUrl.searchParams.get('vendor');
    const groupFilter = req.nextUrl.searchParams.get('group');
    const allKeys = await redis.hgetall<Record<string, string>>('vault:subkeys');

    if (!allKeys) {
      return NextResponse.json({}, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const filtered: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(allKeys)) {
      const parsed = parseKeyRecord(rawValue);
      if (!parsed) continue;
      if (vendorFilter && parsed.vendor !== vendorFilter) continue;
      if (groupFilter && parsed.group !== groupFilter) continue;
      filtered[key] = parsed;
    }

    return NextResponse.json(filtered, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Failed to load keys from Redis', error);
    return NextResponse.json(
      { error: 'Vault datastore unavailable' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const vendor = typeof payload?.vendor === 'string' ? payload.vendor.trim() : '';
    const group = typeof payload?.group === 'string' ? payload.group.trim() : '';
    const totalQuota = typeof payload?.totalQuota === 'number' ? Math.floor(payload.totalQuota) : null;
    const expiresAt = typeof payload?.expiresAt === 'string' && payload.expiresAt ? payload.expiresAt : null;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!isValidVendor(vendor)) {
      return NextResponse.json({ error: 'Invalid vendor supplied' }, { status: 400 });
    }

    if (!group) {
      return NextResponse.json({ error: 'Group is required' }, { status: 400 });
    }

    const randomId = Math.random().toString(36).substring(2, 10);
    const subKey = `sk-vault-${vendor}-${randomId}`;

    const keyData: SubKeyData = {
      name,
      vendor,
      group,
      usage: 0,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      totalQuota,
      expiresAt,
    };

    await redis.hset('vault:subkeys', { [subKey]: JSON.stringify(keyData) });
    return NextResponse.json({ subKey, ...keyData }, { status: 201 });
  } catch (error) {
    console.error('Failed to create sub-key', error);
    return NextResponse.json({ error: 'Unable to create key' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { subKey } = await req.json();

    if (!subKey || typeof subKey !== 'string') {
      return NextResponse.json({ error: 'subKey is required' }, { status: 400 });
    }

    const deleted = await redis.hdel('vault:subkeys', subKey);

    if (deleted === 0) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete sub-key', error);
    return NextResponse.json({ error: 'Unable to delete key' }, { status: 500 });
  }
}
