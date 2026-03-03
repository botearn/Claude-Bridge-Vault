import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor } from '@/lib/vendors';

interface GroupData {
  label: string;
  vendor: string;
  createdAt: string;
}

const parseGroupRecord = (value: string | Record<string, unknown> | null): GroupData | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as GroupData;
    } catch {
      return null;
    }
  }
  return value as unknown as GroupData;
};

export async function GET(req: NextRequest) {
  try {
    const vendorFilter = req.nextUrl.searchParams.get('vendor');
    const allGroups = await redis.hgetall<Record<string, string>>('vault:groups');

    if (!allGroups) {
      return NextResponse.json({}, {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    const filtered: Record<string, GroupData> = {};
    for (const [key, rawValue] of Object.entries(allGroups)) {
      const parsed = parseGroupRecord(rawValue);
      if (!parsed) continue;
      if (vendorFilter && parsed.vendor !== vendorFilter) continue;
      filtered[key] = parsed;
    }

    return NextResponse.json(filtered, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Failed to load groups from Redis', error);
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
    const vendor = typeof payload?.vendor === 'string' ? payload.vendor.trim() : '';
    const groupId = typeof payload?.groupId === 'string' ? payload.groupId.trim() : '';
    const label = typeof payload?.label === 'string' ? payload.label.trim() : '';

    if (!isValidVendor(vendor)) {
      return NextResponse.json({ error: 'Invalid vendor' }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const hashKey = `${vendor}:${groupId}`;
    const groupData: GroupData = {
      label,
      vendor,
      createdAt: new Date().toISOString(),
    };

    await redis.hset('vault:groups', { [hashKey]: JSON.stringify(groupData) });
    return NextResponse.json({ key: hashKey, ...groupData }, { status: 201 });
  } catch (error) {
    console.error('Failed to create group', error);
    return NextResponse.json({ error: 'Unable to create group' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await req.json();
    const key = typeof payload?.key === 'string' ? payload.key.trim() : '';
    const label = typeof payload?.label === 'string' ? payload.label.trim() : '';

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const existing = await redis.hget<string>('vault:groups', key);
    const parsed = parseGroupRecord(existing as string | null);

    if (!parsed) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const updated: GroupData = { ...parsed, label };
    await redis.hset('vault:groups', { [key]: JSON.stringify(updated) });
    return NextResponse.json({ key, ...updated });
  } catch (error) {
    console.error('Failed to update group', error);
    return NextResponse.json({ error: 'Unable to update group' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { key } = await req.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const deleted = await redis.hdel('vault:groups', key);

    if (deleted === 0) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete group', error);
    return NextResponse.json({ error: 'Unable to delete group' }, { status: 500 });
  }
}
