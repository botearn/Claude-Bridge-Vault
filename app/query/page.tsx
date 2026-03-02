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
    const q = (key ?? keyInput).trim();
    if (!q) return;
    if (key) setKeyInput(key);
    setLoading(true);
    setError('');
    setResult(null);
    setShowShare(false);

    try {
      const response = await fetch(`/api/v1/manage/keys/${encodeURIComponent(q)}`);
      if (response.ok) {
        const data = await response.json() as SubKeyRecord;
        setResult(data);

        // prepend to history, dedupe by key
        const entry: HistoryEntry = {
          key: q,
          name: data.name,
          vendor: data.vendor,
          group: data.group,
          usage: data.usage,
          queriedAt: new Date().toISOString(),
        };
        const updated = [entry, ...loadHistory().filter((h) => h.key !== q)];
        saveHistory(updated);
        setHistory(updated);
      } else if (response.status === 404) {
        setError('Invalid Security Key. No record found in vault.');
      } else {
        setError('Vault lookup failed. Please try again.');
      }
    } catch {
      setError('Neural link timeout. Please try again.');
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
    <div className="min-h-screen bg-[#f7f7f7] text-[#111] font-sans selection:bg-black/10">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-black/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                KEY INQUIRY
                <span className="text-[11px] px-2 py-0.5 border border-black/20 rounded-full uppercase">lookup</span>
              </h1>
              <p className="text-sm text-black/60">Verify status and review vault usage</p>
            </div>
          </div>
          <a href="/" className="text-xs text-black/40 hover:text-black transition-colors">
            ← Dashboard
          </a>
        </header>

        {/* Search Box */}
        <div className="border border-black/10 rounded-2xl p-4 mb-6 bg-white shadow-sm shadow-black/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-1 border border-black/10 rounded-xl px-3 py-2 bg-black/[0.03]">
              <Search className="w-4 h-4 text-black/50" />
              <input
                type="text"
                placeholder="Enter your sk-vault-xxxx key..."
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
              {loading ? 'CHECKING' : 'QUERY'}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-black/5 border border-black/10 rounded-xl p-4 flex items-center gap-3 text-xs text-black mb-6">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Result Card */}
        {result && (
          <div className="animate-in fade-in zoom-in-95 duration-300 mb-8">
            <div className="bg-white border border-black/10 rounded-2xl p-6 shadow-sm shadow-black/5">
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
                  <div className="text-lg font-semibold">{result.name || 'Unnamed Key'}</div>
                  <div className="text-xs font-mono text-black/60 mt-1 truncate max-w-[260px]">
                    {result.key}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold leading-none">{result.usage}</div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-black/50 mt-1">Calls</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <BarChart2 size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Total Quota</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.totalQuota != null ? result.totalQuota.toLocaleString() : '∞'}
                  </div>
                </div>
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Zap size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Used</span>
                  </div>
                  <div className="text-sm font-semibold">{result.usage.toLocaleString()}</div>
                </div>
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <BarChart2 size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Remaining</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.totalQuota != null
                      ? Math.max(0, result.totalQuota - result.usage).toLocaleString()
                      : '∞'}
                  </div>
                </div>
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <CalendarClock size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Expires</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : 'Never'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Clock size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Created</span>
                  </div>
                  <div className="text-xs font-mono">{new Date(result.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                  <div className="flex items-center gap-1.5 text-black/50 mb-1.5">
                    <Zap size={11} />
                    <span className="text-[10px] uppercase tracking-[0.2em]">Status</span>
                  </div>
                  <div className="text-xs font-semibold uppercase">Authenticated</div>
                </div>
              </div>

              <div className="border border-black/10 rounded-xl p-4 bg-black/[0.02] mb-4">
                <div className="flex items-center gap-2 text-black/60 mb-1">
                  <Database size={11} />
                  <span className="text-[10px] uppercase tracking-[0.3em]">Base URL</span>
                </div>
                <code className="text-xs font-mono text-black/80 break-all">{result.baseUrl}</code>
              </div>

              <button
                onClick={() => setShowShare((s) => !s)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-black rounded-xl text-xs font-semibold tracking-[0.3em] hover:bg-black hover:text-white transition-colors"
              >
                <Share2 size={12} />
                {showShare ? 'Hide Snippet' : 'Share Snippet'}
              </button>

              {showShare && (
                <div className="mt-4 border border-black/10 rounded-xl p-4 bg-[#fefefe]">
                  <ShareSnippet subKey={result.key} vendor={result.vendor} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Query History */}
        {history.length > 0 && (
          <div className="border border-black/10 rounded-2xl bg-white shadow-sm shadow-black/5 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-black/5">
              <div className="flex items-center gap-2 text-xs font-semibold text-black/50 uppercase tracking-widest">
                <History size={12} />
                Query History
              </div>
              <button
                onClick={clearHistory}
                className="text-[10px] text-black/30 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 size={10} /> Clear all
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
                        <span className="text-[10px] text-black/30 border border-black/10 rounded-full px-2 py-px uppercase tracking-wider flex-shrink-0">
                          {h.vendor}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-black/30 truncate">{h.key}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold">{h.usage} calls</div>
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
          Bridge Vault · Key Lookup
        </div>
      </div>
    </div>
  );
}
