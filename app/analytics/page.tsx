'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart2, Zap, TrendingUp, Key, AlertTriangle, Clock,
  ArrowLeft, RefreshCw, Activity,
} from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorStat {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  keyCount: number;
}

interface KeyHealth {
  key: string;
  name: string;
  vendor: VendorId;
  group: string;
  usage: number;
  totalQuota: number | null;
  quotaPct: number | null;
  daysUntilExpiry: number | null;
  lastUsedHours: number | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

interface DailyPoint { date: string; calls: number; }

interface AnalyticsData {
  summary: {
    totalCalls: number;
    totalTokens: number;
    totalCostUsd: number;
    activeKeys: number;
    keysNearQuota: number;
    expiringKeys: number;
  };
  byVendor: Record<string, VendorStat>;
  keyHealth: KeyHealth[];
  dailyCalls: DailyPoint[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.001) return '<$0.001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtHours(
  h: number | null,
  labels: { never: string; minAgo: (n: number) => string; hourAgo: (n: number) => string; dayAgo: (n: number) => string },
): string {
  if (h === null) return labels.never;
  if (h < 1) return labels.minAgo(Math.round(h * 60));
  if (h < 24) return labels.hourAgo(Math.round(h));
  return labels.dayAgo(Math.floor(h / 24));
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, noDataLabel }: { data: DailyPoint[]; noDataLabel: string }) {
  const W = 500, H = 80, PAD = 8;
  const vals = data.map(d => d.calls);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => {
    const x = vals.length > 1 ? PAD + (i / (vals.length - 1)) * (W - 2 * PAD) : W / 2;
    const y = H - PAD - (v / max) * (H - 2 * PAD);
    return [x, y] as [number, number];
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const last = pts[pts.length - 1];
  const hasData = vals.some(v => v > 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#111" stopOpacity="0" />
        </linearGradient>
      </defs>
      {hasData && <polygon points={area} fill="url(#sg)" />}
      {hasData && <polyline points={line} fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {hasData && last && (
        <circle cx={last[0]} cy={last[1]} r="3" fill="#111" />
      )}
      {!hasData && (
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fontSize="11" fill="#999">{noDataLabel}</text>
      )}
    </svg>
  );
}

// ─── Quota Bar ────────────────────────────────────────────────────────────────

function QuotaBar({ pct, danger }: { pct: number; danger: boolean }) {
  return (
    <div className="h-1 w-full bg-black/8 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${danger ? 'bg-red-400' : pct > 0.6 ? 'bg-amber-400' : 'bg-black/30'}`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ k }: { k: KeyHealth }) {
  const expired = k.daysUntilExpiry !== null && k.daysUntilExpiry <= 0;
  const nearQuota = k.quotaPct !== null && k.quotaPct >= 0.8;
  const stale = k.lastUsedHours !== null && k.lastUsedHours > 72;
  if (expired) return <span title="Expired" className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />;
  if (nearQuota) return <span title="Near quota limit (>80%)" className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />;
  if (stale) return <span title="Inactive for 72+ hours" className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
  return <span title="Healthy" className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-black/6 rounded-lg ${className ?? ''}`} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { t } = useLang();
  const a = t.analytics;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(7);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/v1/manage/analytics');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const slicedDaily = data?.dailyCalls.slice(range === 7 ? -7 : -30) ?? [];
  const totalVendorCalls = Object.values(data?.byVendor ?? {}).reduce((s, v) => s + v.calls, 0);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[13px] text-black/40 hover:text-black transition-colors mr-1">
              <ArrowLeft size={15} />
            </a>
            <div className="w-px h-5 bg-black/10" />
            <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
              <Activity className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
              <p className="text-sm text-black/50">{a.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="p-2 rounded-lg border border-[var(--border)] hover:bg-black/5 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: a.totalCalls, icon: <Zap size={12} />, value: loading ? null : fmtNum(data?.summary.totalCalls ?? 0) },
            { label: a.totalTokens, icon: <BarChart2 size={12} />, value: loading ? null : fmtNum(data?.summary.totalTokens ?? 0) },
            { label: a.estCost, icon: <TrendingUp size={12} />, value: loading ? null : fmtUsd(data?.summary.totalCostUsd ?? 0) },
            { label: a.activeKeys, icon: <Key size={12} />, value: loading ? null : String(data?.summary.activeKeys ?? 0) },
          ].map(({ label, icon, value }) => (
            <div key={label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-4 shadow-vault">
              <div className="flex items-center gap-1.5 text-black/40 mb-2">
                {icon}
                <span className="text-[10px] uppercase tracking-[0.2em]">{label}</span>
              </div>
              {value === null
                ? <Skeleton className="h-6 w-16 mt-1" />
                : <div className="text-xl font-semibold font-mono">{value}</div>
              }
            </div>
          ))}
        </div>

        {/* Alerts row */}
        {!loading && ((data?.summary.keysNearQuota ?? 0) > 0 || (data?.summary.expiringKeys ?? 0) > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {(data?.summary.keysNearQuota ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <AlertTriangle size={11} />
                {a.keysNearQuota(data?.summary.keysNearQuota ?? 0)}
              </div>
            )}
            {(data?.summary.expiringKeys ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <Clock size={11} />
                {a.keysExpiring(data?.summary.expiringKeys ?? 0)}
              </div>
            )}
          </div>
        )}

        {/* Trend + Vendor Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">

          {/* Sparkline */}
          <div className="md:col-span-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-5 shadow-vault">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-black/50">{a.callActivity}</div>
              <div className="flex gap-1">
                {([7, 30] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${range === r ? 'bg-black text-white' : 'text-black/40 hover:text-black hover:bg-black/5'}`}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>
            <div className="h-20">
              {loading
                ? <Skeleton className="h-full w-full" />
                : <Sparkline data={slicedDaily} noDataLabel={a.noData} />
              }
            </div>
            {!loading && slicedDaily.length > 0 && (
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-black/40 font-mono">{shortDate(slicedDaily[0].date)}</span>
                <span className="text-[9px] text-black/40 font-mono">{shortDate(slicedDaily[slicedDaily.length - 1].date)}</span>
              </div>
            )}
          </div>

          {/* Vendor Breakdown */}
          <div className="md:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-5 shadow-vault">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-black/50 mb-4">{a.vendorBreakdown}</div>
            {loading
              ? <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-8" />)}</div>
              : (
                <div className="space-y-3">
                  {Object.entries(data?.byVendor ?? {}).length === 0 && (
                    <p className="text-xs text-black/30 text-center py-4">{a.noData}</p>
                  )}
                  {Object.entries(data?.byVendor ?? {}).sort((a2, b) => b[1].calls - a2[1].calls).map(([vendor, stat]) => {
                    const pct = totalVendorCalls > 0 ? stat.calls / totalVendorCalls : 0;
                    const cfg = VENDOR_CONFIG[vendor as VendorId];
                    return (
                      <div key={vendor}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{cfg?.label ?? vendor}</span>
                          <span className="text-[10px] font-mono text-black/40">{fmtNum(stat.calls)} {a.calls}</span>
                        </div>
                        <div className="h-1.5 w-full bg-black/6 rounded-full overflow-hidden">
                          <div className="h-full bg-black/25 rounded-full" style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[9px] text-black/25">{fmtNum(stat.inputTokens + stat.outputTokens)} {a.tok}</span>
                          <span className="text-[9px] text-black/25">{fmtUsd(stat.costUsd)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* Key Health Grid */}
        <div className="mb-2">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-black/40 mb-3">{a.keyHealth}</div>
          {loading
            ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-36" />)}
              </div>
            )
            : data?.keyHealth.length === 0
              ? (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-8 text-center text-sm text-black/30 shadow-sm">
                  {a.noKeys}
                </div>
              )
              : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {data?.keyHealth.map(k => {
                    const expired = k.daysUntilExpiry !== null && k.daysUntilExpiry <= 0;
                    const nearQ = k.quotaPct !== null && k.quotaPct >= 0.8;
                    const cfg = VENDOR_CONFIG[k.vendor];
                    const tokens = (k.inputTokens || 0) + (k.outputTokens || 0);
                    return (
                      <div key={k.key} className={`bg-[var(--surface)] border rounded-[var(--radius-xl)] p-4 shadow-vault ${expired ? 'border-red-200' : nearQ ? 'border-amber-200' : 'border-[var(--border)]'}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" title={k.name || 'Unnamed'}>{k.name || 'Unnamed'}</div>
                            <div className="text-[10px] text-black/40 font-mono" title={k.key}>{k.key.slice(-12)}</div>
                          </div>
                          <span className="text-[9px] uppercase tracking-wider border border-black/15 rounded-full px-2 py-0.5 flex-shrink-0 ml-2">
                            {cfg?.label ?? k.vendor}
                          </span>
                        </div>

                        {/* Quota */}
                        <div className="mb-2">
                          {k.quotaPct !== null ? (
                            <>
                              <div className="flex justify-between text-[10px] text-black/40 mb-1">
                                <span>{a.quota}</span>
                                <span className="font-mono">{fmtNum((k.inputTokens||0)+(k.outputTokens||0))} / {fmtNum(k.totalQuota!)} tok</span>
                              </div>
                              <QuotaBar pct={k.quotaPct} danger={nearQ} />
                            </>
                          ) : (
                            <div className="text-[10px] text-black/30">{a.quota}: <span className="font-mono">{a.unlimited}</span></div>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 text-[10px] text-black/40 font-mono mt-2">
                          <span>{fmtNum(k.usage)} {a.calls}</span>
                          {tokens > 0 && <span>{fmtNum(tokens)} {a.tok}</span>}
                          {k.costUsd != null && <span>{fmtUsd(k.costUsd)}</span>}
                        </div>

                        {/* Footer row */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
                          <div className="flex items-center gap-1.5 text-[10px] text-black/35">
                            <Clock size={9} />
                            {fmtHours(k.lastUsedHours, a)}
                          </div>
                          <div className="flex items-center gap-1">
                            <StatusDot k={k} />
                            <span className="text-[10px] text-black/35">
                              {expired ? a.expired : k.daysUntilExpiry !== null ? a.daysLeft(k.daysUntilExpiry) : a.noExpiry}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
          }
        </div>

        <div className="mt-10 pt-4 border-t border-black/5 text-xs text-black/40 text-center">
          {a.footer(new Date().toLocaleDateString())}
        </div>
      </div>
    </div>
  );
}
