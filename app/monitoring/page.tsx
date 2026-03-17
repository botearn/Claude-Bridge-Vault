'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Activity, Key, Zap, AlertTriangle, CheckCircle, XCircle, CloudDownload } from 'lucide-react';
import Link from 'next/link';
import { useLang, LangToggle } from '@/components/LangContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeyRow {
  key: string;
  name: string;
  vendor: string;
  usage: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  totalQuota: number | null;
  usedTokens: number;
  quotaPct: number | null;
  status: 'active' | 'exhausted' | 'no-quota';
  createdAt: string;
  lastUsed: string | null;
  lastUsedHours: number | null;
}

interface VaultEvent {
  type: string;
  subKey: string;
  vendor: string;
  group: string;
  name: string;
  timestamp: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface YASync {
  keyInfo: { name: string; totalCostLimit: number; totalCost: number; tokenLimit: number };
  total: { requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; allTokens: number };
  daily: { requests: number; allTokens: number };
  recentRecords: { timestamp: string; model: string; inputTokens: number; outputTokens: number; cost: number; totalTokens: number }[];
  syncedAt: string;
}

interface MonitorData {
  group: string;
  summary: {
    totalKeys: number;
    active: number;
    exhausted: number;
    noQuota: number;
    totalCalls: number;
    totalTokens: number;
    totalQuota: number;
    totalCostUsd: number;
    quotaUtilizationPct: number | null;
  };
  keys: KeyRow[];
  events: VaultEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (!n) return '$0.00';
  if (n < 0.001) return '<$0.001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtAgo(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const { t } = useLang();
  const m = t.monitoring;
  const [data, setData] = useState<MonitorData | null>(null);
  const [yaSync, setYaSync] = useState<YASync | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('botearn');
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const EVENT_META: Record<string, { label: string; color: string }> = {
    'key.created':    { label: m.eventCreated, color: 'text-blue-600 bg-blue-50' },
    'key.deleted':    { label: m.eventDeleted, color: 'text-gray-500 bg-gray-100' },
    'proxy.success':  { label: m.eventSuccess, color: 'text-green-600 bg-green-50' },
    'quota.exceeded': { label: m.eventQuota, color: 'text-red-600 bg-red-50' },
    'key.expired':    { label: m.eventExpired, color: 'text-orange-600 bg-orange-50' },
    'key.invalid':    { label: m.eventInvalid, color: 'text-red-500 bg-red-50' },
  };

  const load = useCallback(async (g: string) => {
    setRefreshing(true);
    try {
      const [monRes, yaRes] = await Promise.all([
        fetch(`/api/v1/manage/monitor?group=${encodeURIComponent(g)}`),
        fetch('/api/v1/manage/analytics'),
      ]);
      if (monRes.ok) setData(await monRes.json());
      if (yaRes.ok) {
        const d = await yaRes.json();
        if (d.youragentSync) setYaSync(d.youragentSync);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/v1/manage/analytics?action=sync-youragent', { method: 'POST' });
      if (res.ok) {
        const yaRes = await fetch('/api/v1/manage/analytics');
        if (yaRes.ok) {
          const d = await yaRes.json();
          if (d.youragentSync) setYaSync(d.youragentSync);
        }
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => { load(group); }, [group, load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => load(group), 30_000);
    return () => clearInterval(t);
  }, [group, load]);

  return (
    <div className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text)]">
      {/* Header */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/vault" className="p-2 rounded-full hover:bg-black/5 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-black rounded-full">
              <Activity size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-none">{m.title}</h1>
              <p className="text-xs text-black/40 mt-0.5">{m.subtitle}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          <input
            className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-1 focus:ring-black/20"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder={m.groupFilter}
            aria-label={m.groupFilter}
          />
          <button
            onClick={triggerSync}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-black/5 transition-colors"
          >
            <CloudDownload size={14} className={syncing ? 'animate-pulse' : ''} />
            {m.syncYA}
          </button>
          <button
            onClick={() => load(group)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-black/5 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {m.refresh}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-20 text-black/40">{m.loading}</div>
        ) : !data ? (
          <div className="text-center py-20 text-black/40">{m.loadFailed}</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={<Key size={16} />} label={m.totalKeys} value={String(data.summary.totalKeys)} sub={`${data.summary.active} ${m.active} · ${data.summary.exhausted} ${m.exhausted}`} />
              <StatCard icon={<Zap size={16} />} label={m.totalCalls} value={fmtNum(data.summary.totalCalls)} />
              <StatCard icon={<Activity size={16} />} label={m.tokensUsed} value={fmtNum(data.summary.totalTokens)} sub={data.summary.totalQuota > 0 ? `${m.quota} ${fmtNum(data.summary.totalQuota)}` : m.noQuota} />
              <StatCard icon={<AlertTriangle size={16} />} label={m.quotaUtil} value={data.summary.quotaUtilizationPct != null ? `${(data.summary.quotaUtilizationPct * 100).toFixed(1)}%` : '—'} sub={fmtUsd(data.summary.totalCostUsd)} />
            </div>

            {/* YourAgent Real Data */}
            {yaSync && (
              <section className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                  <div>
                    <h2 className="font-medium text-sm">{m.yaRealData}</h2>
                    <p className="text-xs text-black/40 mt-0.5">{m.syncedAt} {fmtTime(yaSync.syncedAt)}</p>
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{m.live}</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* Cost bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-black/50">{m.costBudget}</span>
                      <span className="font-semibold tabular-nums">
                        {fmtUsd(yaSync.keyInfo.totalCost)} / {fmtUsd(yaSync.keyInfo.totalCostLimit)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          yaSync.keyInfo.totalCost / yaSync.keyInfo.totalCostLimit >= 0.9 ? 'bg-red-400' :
                          yaSync.keyInfo.totalCost / yaSync.keyInfo.totalCostLimit >= 0.7 ? 'bg-orange-400' : 'bg-green-400'
                        }`}
                        style={{ width: `${Math.min(100, (yaSync.keyInfo.totalCost / yaSync.keyInfo.totalCostLimit) * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <div className="text-xs text-black/40 mt-1">
                      {((yaSync.keyInfo.totalCost / yaSync.keyInfo.totalCostLimit) * 100).toFixed(1)}% {m.used} · {m.remaining} {fmtUsd(yaSync.keyInfo.totalCostLimit - yaSync.keyInfo.totalCost)}
                    </div>
                  </div>

                  {/* Token stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: m.totalRequests, value: String(yaSync.total.requests) },
                      { label: m.inputTokens, value: fmtNum(yaSync.total.inputTokens) },
                      { label: m.outputTokens, value: fmtNum(yaSync.total.outputTokens) },
                      { label: m.cacheRead, value: fmtNum(yaSync.total.cacheReadTokens) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-black/[0.02] rounded-xl px-4 py-3">
                        <div className="text-xs text-black/40 mb-1">{label}</div>
                        <div className="font-semibold tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent records */}
                  {yaSync.recentRecords.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-black/50 mb-2">{m.recentCalls}</h3>
                      <div className="border border-black/5 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-black/[0.02] border-b border-black/5">
                              <th className="text-left px-4 py-2 font-medium text-black/40">{m.colTime}</th>
                              <th className="text-left px-4 py-2 font-medium text-black/40">{m.colModel}</th>
                              <th className="text-right px-4 py-2 font-medium text-black/40">{m.colInput}</th>
                              <th className="text-right px-4 py-2 font-medium text-black/40">{m.colOutput}</th>
                              <th className="text-right px-4 py-2 font-medium text-black/40">{m.colCost}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yaSync.recentRecords.slice(0, 20).map((r, i) => (
                              <tr key={i} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                                <td className="px-4 py-2 text-black/40">{fmtTime(r.timestamp)}</td>
                                <td className="px-4 py-2 font-mono text-black/60 truncate max-w-[160px]">
                                  {r.model.replace('claude-', '').replace(/-2025\d+/, '')}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.inputTokens)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.outputTokens)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(r.cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Keys table */}
            <section className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                <h2 className="font-medium text-sm">{m.keyList} <span className="text-black/40 font-normal">· {m.group}: {data.group}</span></h2>
                <span className="text-xs text-black/40">{data.keys.length} {m.items}</span>
              </div>
              {data.keys.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-black/40">{m.noKeys}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-black/5 text-xs text-black/40">
                        <th className="text-left px-5 py-3 font-medium">{m.colName}</th>
                        <th className="text-left px-4 py-3 font-medium">{m.colVendor}</th>
                        <th className="text-left px-4 py-3 font-medium">{m.colStatus}</th>
                        <th className="text-right px-4 py-3 font-medium">{m.colCalls}</th>
                        <th className="text-right px-4 py-3 font-medium">{m.colTokensUsed}</th>
                        <th className="text-left px-4 py-3 font-medium w-32">{m.colQuotaProgress}</th>
                        <th className="text-right px-4 py-3 font-medium">{m.colCost}</th>
                        <th className="text-right px-5 py-3 font-medium">{m.colLastUsed}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.keys.map((k) => (
                        <tr key={k.key} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                          <td className="px-5 py-3">
                            <div className="font-medium truncate max-w-[180px]" title={k.name}>{k.name}</div>
                            <div className="text-xs text-black/40 font-mono">...{k.key.slice(-8)}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-black/50 uppercase">{k.vendor}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={k.status} labels={{ active: m.statusActive, exhausted: m.statusExhausted, noQuota: m.statusNoQuota }} />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtNum(k.usage)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span>{fmtNum(k.inputTokens + k.outputTokens)}</span>
                            <span className="text-xs text-black/40 ml-1">({fmtNum(k.inputTokens)}/{fmtNum(k.outputTokens)})</span>
                          </td>
                          <td className="px-4 py-3">
                            {k.quotaPct != null ? (
                              <div className="space-y-1">
                                <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${k.quotaPct >= 1 ? 'bg-red-400' : k.quotaPct >= 0.8 ? 'bg-orange-400' : 'bg-green-400'}`}
                                    style={{ width: `${Math.min(100, k.quotaPct * 100)}%` }}
                                  />
                                </div>
                                <div className="text-xs text-black/40">{(k.quotaPct * 100).toFixed(0)}%</div>
                              </div>
                            ) : <span className="text-xs text-black/30">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtUsd(k.costUsd)}</td>
                          <td className="px-5 py-3 text-right text-xs text-black/40">{fmtAgo(k.lastUsedHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Events */}
            <section className="bg-white rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                <h2 className="font-medium text-sm">{m.eventLog}</h2>
                <span className="text-xs text-black/40">{m.recentN(data.events.length)}</span>
              </div>
              {data.events.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-black/40">{m.noEvents}</div>
              ) : (
                <div className="divide-y divide-black/5 max-h-[480px] overflow-y-auto">
                  {data.events.map((e, i) => {
                    const meta = EVENT_META[e.type] ?? { label: e.type, color: 'text-gray-500 bg-gray-100' };
                    return (
                      <div key={i} className="px-5 py-3 flex items-start gap-3 text-sm">
                        <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.color}`}>{meta.label}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{e.name}</span>
                          <span className="text-black/40 ml-2 font-mono text-xs">...{e.subKey}</span>
                          {e.model && <span className="text-black/40 ml-2 text-xs">{e.model}</span>}
                          {(e.inputTokens || e.outputTokens) ? (
                            <span className="text-black/40 ml-2 text-xs">in={fmtNum(e.inputTokens ?? 0)} out={fmtNum(e.outputTokens ?? 0)}</span>
                          ) : null}
                        </div>
                        <span className="text-xs text-black/40 shrink-0">{fmtTime(e.timestamp)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--border)] shadow-sm p-5">
      <div className="flex items-center gap-2 text-black/40 text-xs mb-3">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-black/40 mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status, labels }: { status: string; labels: { active: string; exhausted: string; noQuota: string } }) {
  if (status === 'active') return (
    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} />{labels.active}</span>
  );
  if (status === 'exhausted') return (
    <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} />{labels.exhausted}</span>
  );
  return <span className="text-xs text-black/40">{labels.noQuota}</span>;
}
