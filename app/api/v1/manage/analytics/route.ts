import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getUsageLogs } from '@/lib/usage-log';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import type { SubKeyData } from '@/lib/types';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

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

export async function GET(req: NextRequest) {
  const dates = last30Days();
  const now = new Date();

  // Resolve session for user isolation
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isAdmin = session?.role === 'admin';

  // Parallel fetch — keys, daily counts, and recent latency logs
  const [rawKeys, rawCounts, recentLogs] = await Promise.all([
    redis.hgetall<Record<string, string>>('vault:subkeys'),
    dates.length > 0
      ? redis.mget<(string | null)[]>(...dates.map(d => `vault:daily:calls:${d}`) as [string, ...string[]])
      : Promise.resolve([] as (string | null)[]),
    getUsageLogs({ limit: 200 }).catch(() => []),
  ]);

  const url = new URL(req.url);
  const scopeFilter = url.searchParams.get('scope'); // 'internal' | 'external'

  const allKeys: (SubKeyData & { key: string })[] = rawKeys
    ? Object.entries(rawKeys)
        .map(([k, v]) => { const d = parseSafe(v); return d ? { ...d, key: k } : null; })
        .filter(Boolean) as (SubKeyData & { key: string })[]
    : [];

  // User isolation: non-admin users only see their own keys
  const visibleKeys = isAdmin ? allKeys : allKeys.filter(k => k.userId === session?.userId);

  const keys = scopeFilter
    ? visibleKeys.filter(k => (k.scope ?? 'internal') === scopeFilter)
    : visibleKeys;

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

  // When a scope filter is active, the global daily counter can't be filtered —
  // compute daily calls from per-key hashes instead so the chart matches the stats.
  let dailyCalls: { date: string; calls: number }[];
  if (scopeFilter) {
    const scopedKeySet = new Set(keys.map(k => k.key));
    const dailyHashes = await Promise.all(
      dates.map(d => redis.hgetall<Record<string, string>>(`vault:daily:keys:${d}`).catch(() => null))
    );
    dailyCalls = dates.map((date, i) => {
      const hash = dailyHashes[i] ?? {};
      let calls = 0;
      for (const [k, v] of Object.entries(hash)) {
        if (!scopedKeySet.has(k)) continue;
        try {
          const parsed = typeof v === 'string' ? JSON.parse(v) : v;
          calls += parsed.calls || 0;
        } catch { /* skip malformed */ }
      }
      return { date, calls };
    });
  } else {
    dailyCalls = dates.map(d => ({ date: d, calls: 0 }));
    if (rawCounts) {
      rawCounts.forEach((v, i) => {
        if (v != null) dailyCalls[i].calls = parseInt(String(v), 10);
      });
    }
  }

  // Optional: per-key daily breakdown
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

  // Latency percentiles from recent successful logs
  const latencies = recentLogs
    .filter(l => l.status === 'success' && l.latencyMs > 0)
    .map(l => l.latencyMs)
    .sort((a, b) => a - b);
  const latencyP50 = percentile(latencies, 50);
  const latencyP95 = percentile(latencies, 95);
  const latencyP99 = percentile(latencies, 99);

  return NextResponse.json({
    summary: { totalCalls, totalTokens: totalInputTokens + totalOutputTokens, totalCostUsd, activeKeys: keys.length, keysNearQuota, expiringKeys, latencyP50, latencyP95, latencyP99 },
    byVendor,
    keyHealth,
    dailyCalls,
    ...(dailyKeyUsage ? { dailyKeyUsage } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

