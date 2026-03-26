'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, FileText, CheckCircle2, XCircle, Clock, Filter } from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';

interface LogEntry {
  subKey: string;
  userId?: string;
  vendor: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorCode?: number;
  timestamp: string;
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.0001) return '<$0.0001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(4)}`;
}

function fmtMs(ms: number): string {
  if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-black/6 rounded ${className ?? ''}`} />;
}

const VENDORS = ['', 'claude', 'youragent', 'yunwu'] as const;

export default function LogsPage() {
  const { t } = useLang();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vendor, setVendor] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'error'>('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async (quiet = false, v?: string, s?: string, off?: number) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off ?? offset) });
      if ((v ?? vendor)) params.set('vendor', v ?? vendor);
      const res = await fetch(`/api/v1/manage/usage-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        let entries: LogEntry[] = data.logs ?? [];
        if ((s ?? statusFilter)) entries = entries.filter(l => l.status === (s ?? statusFilter));
        setLogs(entries);
        setTotal(data.count ?? entries.length);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendor, statusFilter, offset]);

  useEffect(() => { load(); }, []);

  const handleFilter = (v: string, s: string) => {
    setVendor(v);
    setStatusFilter(s as '' | 'success' | 'error');
    setOffset(0);
    load(false, v, s, 0);
  };

  const handlePage = (dir: 1 | -1) => {
    const newOff = Math.max(0, offset + dir * LIMIT);
    setOffset(newOff);
    load(false, vendor, statusFilter, newOff);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[13px] text-black/40 hover:text-black transition-colors mr-1">
              <ArrowLeft size={15} />
            </a>
            <div className="w-px h-5 bg-black/10" />
            <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
              <FileText className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {(t as any).logs?.title ?? 'Request Logs'}
              </h1>
              <p className="text-sm text-black/50">
                {(t as any).logs?.subtitle ?? 'Recent API calls through the gateway'}
              </p>
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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-1.5 text-[10px] text-black/40">
            <Filter size={11} />
            <span className="uppercase tracking-wider">Filter</span>
          </div>

          {/* Vendor filter */}
          <div className="flex items-center gap-1 bg-white border border-black/10 rounded-xl p-1">
            {VENDORS.map(v => (
              <button
                key={v}
                onClick={() => handleFilter(v, statusFilter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  vendor === v ? 'bg-black text-white' : 'text-black/50 hover:text-black hover:bg-black/5'
                }`}
              >
                {v ? (VENDOR_CONFIG[v as VendorId]?.label ?? v) : 'All'}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-white border border-black/10 rounded-xl p-1">
            {([['', 'All'], ['success', 'Success'], ['error', 'Error']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => handleFilter(vendor, v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === v ? 'bg-black text-white' : 'text-black/50 hover:text-black hover:bg-black/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-vault overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-black/30">No logs found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black/5 text-black/40">
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                    <th className="text-left px-4 py-3 font-medium">Key</th>
                    <th className="text-left px-4 py-3 font-medium">Vendor</th>
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-right px-4 py-3 font-medium">Tokens (in/out)</th>
                    <th className="text-right px-4 py-3 font-medium">Cost</th>
                    <th className="text-right px-4 py-3 font-medium">Latency</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} className="border-b border-black/5 last:border-0 hover:bg-black/[0.015] transition-colors">
                      <td className="px-4 py-2.5 text-black/50 font-mono whitespace-nowrap">
                        {fmtTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-black/60">
                        ...{log.subKey}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] border border-black/15 rounded-full px-2 py-0.5 uppercase tracking-wider text-black/50">
                          {VENDOR_CONFIG[log.vendor as VendorId]?.label ?? log.vendor}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-black/60 font-mono max-w-[140px] truncate" title={log.model}>
                        {log.model ? (
                          <span title={log.model}>
                            {log.model.length > 18 ? log.model.slice(-18) : log.model}
                          </span>
                        ) : <span className="text-black/20">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono">
                        {fmtNum(log.inputTokens)}<span className="text-black/30">/</span>{fmtNum(log.outputTokens)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono">
                        {log.costUsd > 0 ? fmtUsd(log.costUsd) : <span className="text-black/25">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-mono ${
                        log.latencyMs > 5000 ? 'text-red-400' : log.latencyMs > 2000 ? 'text-amber-500' : 'text-black/60'
                      }`}>
                        {fmtMs(log.latencyMs)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {log.status === 'success'
                          ? <CheckCircle2 size={14} className="text-emerald-500 inline" />
                          : <span title={log.errorCode ? `HTTP ${log.errorCode}` : 'error'}><XCircle size={14} className="text-red-400 inline" /></span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-xs text-black/40">
            <span>{offset + 1}–{offset + logs.length} of {total > 0 ? total : '?'}</span>
            <div className="flex gap-2">
              <button
                onClick={() => handlePage(-1)}
                disabled={offset === 0}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => handlePage(1)}
                disabled={logs.length < LIMIT}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Latency legend */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center gap-4 mt-4 text-[10px] text-black/30">
            <div className="flex items-center gap-1"><Clock size={10} /> Latency color:</div>
            <span className="text-black/50">normal (&lt;2s)</span>
            <span className="text-amber-500">slow (2–5s)</span>
            <span className="text-red-400">very slow (&gt;5s)</span>
          </div>
        )}

      </div>
    </div>
  );
}
