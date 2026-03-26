import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor } from '@/lib/vendors';
import type { SubKeyData, KeyScope } from '@/lib/types';
import { logEvent } from '@/lib/events';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';

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
    const scopeFilter = req.nextUrl.searchParams.get('scope'); // 'internal' | 'external'
    const limitParam = req.nextUrl.searchParams.get('limit');
    const cursorParam = req.nextUrl.searchParams.get('cursor');

    // Resolve session for user isolation
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const isAdmin = session?.role === 'admin';

    const allKeys = await redis.hgetall<Record<string, string>>('vault:subkeys');

    if (!allKeys) {
      return NextResponse.json(limitParam ? { keys: {}, nextCursor: null, total: 0 } : {}, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    // Filter
    const entries: [string, SubKeyData][] = [];
    for (const [key, rawValue] of Object.entries(allKeys)) {
      const parsed = parseKeyRecord(rawValue);
      if (!parsed) continue;
      // User isolation: non-admin users only see their own keys
      if (!isAdmin && parsed.userId !== session?.userId) continue;
      if (vendorFilter && parsed.vendor !== vendorFilter) continue;
      if (groupFilter && parsed.group !== groupFilter) continue;
      if (scopeFilter) {
        const keyScope = parsed.scope ?? 'internal';
        if (keyScope !== scopeFilter) continue;
      }
      entries.push([key, parsed]);
    }

    // Sort by createdAt desc for stable cursor ordering
    entries.sort((a, b) => (b[1].createdAt ?? '').localeCompare(a[1].createdAt ?? ''));

    // If no limit param, return all (backward compatible)
    if (!limitParam) {
      const filtered: Record<string, SubKeyData> = {};
      for (const [key, data] of entries) filtered[key] = data;
      return NextResponse.json(filtered, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }

    // Paginated response
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);
    const rawOffset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);
    const safeOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 100_000) : 0;
    let startIdx = safeOffset;
    if (cursorParam) {
      const idx = entries.findIndex(([key]) => key === cursorParam);
      if (idx >= 0) startIdx = idx + 1;
    }

    const page = entries.slice(startIdx, startIdx + limit);
    const keys: Record<string, SubKeyData> = {};
    for (const [key, data] of page) keys[key] = data;
    const nextCursor = page.length === limit && startIdx + limit < entries.length
      ? page[page.length - 1][0]
      : null;

    return NextResponse.json({ keys, nextCursor, total: entries.length }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Failed to load keys from Redis', error);
    return NextResponse.json(
      { error: 'Vault datastore unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Extract user from session (optional — legacy admin cookie also passes middleware)
    let userId: string | undefined;
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (token) {
      const session = await verifySessionToken(token);
      if (session) userId = session.userId;
    }

    const payload = await req.json();
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const vendor = typeof payload?.vendor === 'string' ? payload.vendor.trim() : '';
    const group = typeof payload?.group === 'string' ? payload.group.trim() : '';
    const scope: KeyScope = payload?.scope === 'external' ? 'external' : 'internal';
    const model = typeof payload?.model === 'string' && payload.model ? payload.model : undefined;
    const totalQuota = typeof payload?.totalQuota === 'number' && payload.totalQuota > 0 ? Math.floor(payload.totalQuota) : null;
    const expiresAt = typeof payload?.expiresAt === 'string' && payload.expiresAt ? payload.expiresAt : null;
    const budgetUsd = typeof payload?.budgetUsd === 'number' && payload.budgetUsd > 0 ? payload.budgetUsd : null;

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
      scope,
      ...(model ? { model } : {}),
      ...(userId ? { userId } : {}),
      usage: 0,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      totalQuota,
      expiresAt,
      ...(budgetUsd != null ? { budgetUsd } : {}),
    };

    await redis.hset('vault:subkeys', { [subKey]: JSON.stringify(keyData) });
    void logEvent({ type: 'key.created', subKey: subKey.slice(-8), vendor, group, name, timestamp: keyData.createdAt });
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

    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    const existing = await redis.hget<string>('vault:subkeys', subKey);
    if (!existing) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    // Ownership check: non-admin can only delete their own keys
    const kd = parseKeyRecord(existing);
    if (session?.role !== 'admin' && kd?.userId !== session?.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deleted = await redis.hdel('vault:subkeys', subKey);

    if (deleted === 0) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    if (existing) {
      try {
        const kd = typeof existing === 'string' ? JSON.parse(existing) : existing;
        void logEvent({ type: 'key.deleted', subKey: subKey.slice(-8), vendor: kd.vendor, group: kd.group, name: kd.name, timestamp: new Date().toISOString() });
      } catch { /* ignore */ }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete sub-key', error);
    return NextResponse.json({ error: 'Unable to delete key' }, { status: 500 });
  }
}
