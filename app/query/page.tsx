'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Clock,
  Database,
  Zap,
  ArrowRight,
  AlertCircle,
  Share2,
  BarChart2,
  CalendarClock,
  KeyRound,
  History,
  Trash2,
} from 'lucide-react';
import type { SubKeyRecord } from '@/lib/types';
import { VENDOR_CONFIG } from '@/lib/vendors';
import { ShareSnippet } from '@/components/ShareSnippet';
import { useLang, LangToggle } from '@/components/LangContext';

const HISTORY_KEY = 'vault:query_history';
const MAX_HISTORY = 20;

interface HistoryEntry {
  key: string;
  name: string;
  vendor: string;
  group: string;
  usage: number;
  queriedAt: string;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

export default function UsageQuery() {
  const { t } = useLang();
  const q = t.query;
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubKeyRecord | null>(null);
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleQuery = async (key?: string) => {
    const queryKey = (key ?? keyInput).trim();
    if (!queryKey) return;
    if (key) setKeyInput(key);
    setLoading(true);
    setError('');
    setResult(null);
    setShowShare(false);

    try {
      const response = await fetch(`/api/v1/manage/keys/${encodeURIComponent(queryKey)}`);
      if (response.ok) {
        const data = await response.json() as SubKeyRecord;
        setResult(data);

        const entry: HistoryEntry = {
          key: queryKey,
          name: data.name,
          vendor: data.vendor,
          group: data.group,
          usage: data.usage,
          queriedAt: new Date().toISOString(),
        };
        const updated = [entry, ...loadHistory().filter((h) => h.key !== queryKey)];
        saveHistory(updated);
        setHistory(updated);
      } else if (response.status === 404) {
        setError(q.errorNotFound);
      } else {
        setError(q.errorFailed);
      }
    } catch {
      setError(q.errorTimeout);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const removeEntry = (key: string) => {
    const updated = history.filter((h) => h.key !== key);
    saveHistory(updated);
    setHistory(updated);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[13px] text-black/40 hover:text-black transition-colors mr-1">&larr;</a>
            <div className="w-px h-5 bg-black/10" />
            <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                {q.title}
                <span className="text-[11px] px-2 py-0.5 border border-black/20 rounded-full uppercase">
                  {q.badge}
                </span>
              </h1>
              <p className="text-sm text-black/60">{q.subtitle}</p>
            </div>
          </div>
          <LangToggle />
        </header>

        {/* Search Box */}
        <div className="border border-[var(--border)] rounded-[var(--radius-xl)] p-4 mb-6 bg-white shadow-vault">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-1 border border-[var(--border)] rounded-xl px-3 py-2 bg-black/[0.03]">
              <Search className="w-4 h-4 text-black/50" />
              <input
                type="text"
                placeholder={q.placeholder}
                className="flex-1 bg-transparent border-none focus:outline-none text-sm font-mono text-black placeholder:text-black/30"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              />
            </div>
            <button
              onClick={() => handleQuery()}
              disabled={loading}
              className="w-full sm:w-auto px-5 py-2.5 border border-black rounded-xl text-xs font-semibold tracking-[0.2em] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black hover:text-white transition-colors"
            >
              {loading ? q.checking : q.query}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-black/5 border border-[var(--border)] rounded-xl p-4 flex items-center gap-3 text-xs text-black mb-6">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Result Card */}
        {result && (
          <div className="animate-in fade-in zoom-in-95 duration-300 mb-8">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6 shadow-vault">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-[0.3em] border border-black/20 rounded-full px-3 py-0.5">
                      {VENDOR_CONFIG[result.vendor].label}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.3em] border border-black/20 rounded-full px-3 py-0.5">
                      {result.group}
                    </span>
                  </div>
                  <div className="text-lg font-semibold">{result.name || q.unnamed}</div>
                  <div className="text-xs font-mono text-black/60 mt-1 truncate max-w-[260px]">
                    {result.key}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold leading-none">{result.usage}</div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-black/50 mt-1">{q.calls}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <BarChart2 size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.totalQuota}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.totalQuota != null ? result.totalQuota.toLocaleString() : '∞'}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Zap size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.used}</span>
                  </div>
                  <div className="text-sm font-semibold">{((result.inputTokens || 0) + (result.outputTokens || 0)).toLocaleString()}</div>
                </div>
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <BarChart2 size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.remaining}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.totalQuota != null
                      ? Math.max(0, result.totalQuota - (result.inputTokens || 0) - (result.outputTokens || 0)).toLocaleString()
                      : '∞'}
                  </div>
                </div>
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <CalendarClock size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.expires}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : t.common.never}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)] sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <BarChart2 size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.tokens}</span>
                  </div>
                  <div className="text-sm font-semibold font-mono">
                    {(result.inputTokens || result.outputTokens)
                      ? ((result.inputTokens || 0) + (result.outputTokens || 0)).toLocaleString()
                      : '—'}
                  </div>
                  {(result.inputTokens || result.outputTokens) && (
                    <div className="text-[10px] text-black/30 font-mono mt-0.5">
                      in {(result.inputTokens || 0).toLocaleString()} · out {(result.outputTokens || 0).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)] sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Zap size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.estCost}</span>
                  </div>
                  <div className="text-sm font-semibold font-mono">
                    {result.costUsd != null
                      ? (result.costUsd === 0 ? '$0.00' : result.costUsd < 0.01 ? '<$0.01' : `$${result.costUsd.toFixed(4)}`)
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Clock size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.created}</span>
                  </div>
                  <div className="text-xs font-mono">{new Date(result.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Zap size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">{q.status}</span>
                  </div>
                  <div className="text-xs font-semibold uppercase">{q.authenticated}</div>
                </div>
              </div>

              <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-raised)] mb-4">
                <div className="flex items-center gap-2 text-black/60 mb-1">
                  <Database size={11} />
                  <span className="text-[10px] uppercase tracking-[0.3em]">{q.baseUrl}</span>
                </div>
                <code className="text-xs font-mono text-black/80 break-all">{result.baseUrl}</code>
              </div>

              <button
                onClick={() => setShowShare((s) => !s)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-black rounded-xl text-xs font-semibold tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
              >
                <Share2 size={12} />
                {showShare ? q.hideSnippet : q.shareSnippet}
              </button>

              {showShare && (
                <div className="mt-4 border border-[var(--border)] rounded-xl p-4 bg-[#fefefe]">
                  <ShareSnippet subKey={result.key} vendor={result.vendor} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Query History */}
        {history.length > 0 && (
          <div className="border border-[var(--border)] rounded-[var(--radius-xl)] bg-white shadow-vault overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/5">
              <div className="flex items-center gap-2 text-xs font-semibold text-black/50 uppercase tracking-widest">
                <History size={12} />
                {q.queryHistory}
              </div>
              <button
                onClick={clearHistory}
                className="text-[10px] text-black/30 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 size={10} /> {q.clearAll}
              </button>
            </div>
            <div className="divide-y divide-black/5">
              {history.map((h) => (
                <div
                  key={h.key + h.queriedAt}
                  className="flex items-center justify-between px-5 py-3 hover:bg-black/[0.01] group"
                >
                  <button
                    className="flex items-start gap-3 flex-1 text-left"
                    onClick={() => handleQuery(h.key)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium truncate">{h.name}</span>
                        <span className="text-[10px] text-black/30 border border-[var(--border)] rounded-full px-2 py-px uppercase tracking-wider flex-shrink-0">
                          {h.vendor}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-black/30 truncate">{h.key}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold">{h.usage} {q.callsUnit}</div>
                      <div className="text-[10px] text-black/30">
                        {new Date(h.queriedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => removeEntry(h.key)}
                    className="ml-3 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-black/20 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-black/5 text-xs text-black/30 text-center">
          {q.footerLabel}
        </div>
      </div>
    </div>
  );
}
