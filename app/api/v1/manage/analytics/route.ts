import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { fetchYASync } from '@/lib/youragent-sync';
import type { SubKeyData } from '@/lib/types';

function parseSafe(v: unknown): SubKeyData | null {
  if (!v) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v as SubKeyData;
}

function last30Days(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export async function GET(req: Request) {
  const dates = last30Days();
  const now = new Date();

  // Parallel fetch — cuts 3 sequential ~6s Redis round-trips down to ~6s total
  const [rawKeys, rawCounts, yaRaw] = await Promise.all([
    redis.hgetall<Record<string, string>>('vault:subkeys'),
    dates.length > 0
      ? redis.mget<(string | null)[]>(...dates.map(d => `vault:daily:calls:${d}`) as [string, ...string[]])
      : Promise.resolve([] as (string | null)[]),
    redis.get('vault:youragent:sync').catch(() => null),
  ]);

  const keys: (SubKeyData & { key: string })[] = rawKeys
    ? Object.entries(rawKeys)
        .map(([k, v]) => { const d = parseSafe(v); return d ? { ...d, key: k } : null; })
        .filter(Boolean) as (SubKeyData & { key: string })[]
    : [];

  const byVendor: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number; keyCount: number }> = {};
  let totalCalls = 0, totalInputTokens = 0, totalOutputTokens = 0, totalCostUsd = 0;
  let keysNearQuota = 0, expiringKeys = 0;

  for (const k of keys) {
    const vendor = k.vendor;
    if (!byVendor[vendor]) byVendor[vendor] = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, keyCount: 0 };
    const v = byVendor[vendor];
    v.keyCount++;
    v.calls += k.usage || 0;
    v.inputTokens += k.inputTokens || 0;
    v.outputTokens += k.outputTokens || 0;
    v.costUsd += k.costUsd || 0;
    totalCalls += k.usage || 0;
    totalInputTokens += k.inputTokens || 0;
    totalOutputTokens += k.outputTokens || 0;
    totalCostUsd += k.costUsd || 0;

    const usedTokens = (k.inputTokens || 0) + (k.outputTokens || 0);
    if (k.totalQuota != null && k.totalQuota > 0 && usedTokens / k.totalQuota >= 0.8) keysNearQuota++;
    if (k.expiresAt) {
      const daysLeft = (new Date(k.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysLeft <= 7 && daysLeft >= 0) expiringKeys++;
    }
  }

  const keyHealth = keys.map(k => ({
    key: k.key,
    name: k.name,
    vendor: k.vendor,
    group: k.group,
    usage: k.usage || 0,
    totalQuota: k.totalQuota,
    quotaPct: (k.totalQuota != null && k.totalQuota > 0) ? Math.min(1, ((k.inputTokens || 0) + (k.outputTokens || 0)) / k.totalQuota) : null,
    daysUntilExpiry: k.expiresAt
      ? Math.ceil((new Date(k.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null,
    lastUsedHours: k.lastUsed
      ? (now.getTime() - new Date(k.lastUsed).getTime()) / (1000 * 60 * 60)
      : null,
    inputTokens: k.inputTokens,
    outputTokens: k.outputTokens,
    costUsd: k.costUsd,
  }));

  const dailyCalls = dates.map(d => ({ date: d, calls: 0 }));
  if (rawCounts) {
    rawCounts.forEach((v, i) => {
      if (v != null) dailyCalls[i].calls = parseInt(String(v), 10);
    });
  }

  let yaSync = null;
  try {
    if (yaRaw) yaSync = typeof yaRaw === 'string' ? JSON.parse(yaRaw as string) : yaRaw;
  } catch { /* ignore */ }

  // Optional: per-key daily breakdown
  const url = new URL(req.url);
  const wantDailyPerKey = url.searchParams.get('daily') === 'per-key';
  const filterKey = url.searchParams.get('key');

  let dailyKeyUsage = undefined;
  if (wantDailyPerKey) {
    const dailyHashes = await Promise.all(
      dates.map(d => redis.hgetall<Record<string, string>>(`vault:daily:keys:${d}`).catch(() => null))
    );
    dailyKeyUsage = dates.map((date, i) => {
      const hash = dailyHashes[i] ?? {};
      const entries: { key: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[] = [];
      for (const [k, v] of Object.entries(hash)) {
        if (filterKey && k !== filterKey) continue;
        try {
          const parsed = typeof v === 'string' ? JSON.parse(v) : v;
          entries.push({ key: k, ...parsed });
        } catch { /* skip malformed */ }
      }
      return { date, keys: entries };
    });
  }

  return NextResponse.json({
    summary: { totalCalls, totalTokens: totalInputTokens + totalOutputTokens, totalCostUsd, activeKeys: keys.length, keysNearQuota, expiringKeys },
    byVendor,
    keyHealth,
    dailyCalls,
    youragentSync: yaSync,
    ...(dailyKeyUsage ? { dailyKeyUsage } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST ?action=sync-youragent — trigger real data sync from your-agent.cc
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('action') !== 'sync-youragent') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
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
