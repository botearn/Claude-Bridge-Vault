'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId, SubKeyData, KeyScope } from '@/lib/types';
import { KeyTable } from './KeyTable';
import { useLang } from './LangContext';
import { onVaultSync } from '@/lib/vaultSync';
import { estimateClaudeOfficialCostUsd } from '@/lib/billing';

interface KeyRow extends SubKeyData {
  key: string;
}

interface GroupOption {
  hashKey: string;
  label: string;
}

interface VendorCardProps {
  vendor: VendorId;
  scope?: KeyScope;
  onRefreshNeeded?: () => void;
}

export function VendorCard({ vendor, scope = 'internal' }: VendorCardProps) {
  const { t } = useLang();
  const config = VENDOR_CONFIG[vendor];
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('');
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [budgetUsd, setBudgetUsd] = useState<number>(20);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const budgetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (vendor !== 'youragent') return;
    fetch('/api/v1/manage/settings')
      .then(r => r.json())
      .then((d: { youagentBudgetUsd?: number }) => {
        if (typeof d.youagentBudgetUsd === 'number') setBudgetUsd(d.youagentBudgetUsd);
      })
      .catch(() => {});
  }, [vendor]);

  const startEditBudget = () => {
    setBudgetInput(String(budgetUsd));
    setEditingBudget(true);
    setTimeout(() => budgetInputRef.current?.select(), 0);
  };

  const saveBudget = async () => {
    const val = parseFloat(budgetInput);
    if (!Number.isFinite(val) || val < 0) { setEditingBudget(false); return; }
    const res = await fetch('/api/v1/manage/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youagentBudgetUsd: val }),
    });
    if (res.ok) setBudgetUsd(val);
    setEditingBudget(false);
  };

  const summary = keys.reduce(
    (acc, k) => {
      acc.calls += k.usage || 0;
      acc.inputTokens += k.inputTokens || 0;
      acc.outputTokens += k.outputTokens || 0;
      acc.costUsd += k.costUsd || 0;
      return acc;
    },
    { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );

  const totalTokens = summary.inputTokens + summary.outputTokens;
  const claudeOfficialCostUsd = estimateClaudeOfficialCostUsd(undefined, {
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
  });

  const budgetRemainingUsd = Math.max(0, budgetUsd - summary.costUsd);
  const diffUsd = claudeOfficialCostUsd - summary.costUsd;
  const formatUsd = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '$0.00';
    if (n < 0.01) return '<$0.01';
    return `$${n.toFixed(2)}`;
  };

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/manage/groups?vendor=${vendor}`);
      const data = await res.json();
      const opts: GroupOption[] = Object.entries(data).map(([hashKey, val]) => ({
        hashKey,
        label: (val as { label: string }).label,
      }));
      setGroups(opts);
      if (!activeGroup && opts.length > 0) {
        setActiveGroup(opts[0].hashKey.split(':')[1] || opts[0].hashKey);
      }
    } catch {
      setGroups([]);
    }
  }, [vendor, activeGroup]);

  const loadKeys = useCallback(async () => {
    if (!activeGroup) return;
    setLoadingKeys(true);
    try {
      const res = await fetch(`/api/v1/manage/keys?vendor=${vendor}&group=${activeGroup}&scope=${scope}`);
      const data = await res.json();
      const rows: KeyRow[] = Object.entries(data).map(([key, val]) => ({
        key,
        ...(val as SubKeyData),
      }));
      setKeys(rows);
    } catch {
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  }, [vendor, activeGroup, scope]);

  useEffect(() => { loadGroups(); }, [vendor]);
  useEffect(() => { if (activeGroup) loadKeys(); }, [activeGroup, loadKeys]);

  useEffect(() => {
    const off = onVaultSync((payload) => {
      if (payload.vendor && payload.vendor !== vendor) return;
      loadGroups();
      if (activeGroup) loadKeys();
    });
    return off;
  }, [vendor, activeGroup, loadGroups, loadKeys]);

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-xl)] bg-[var(--surface)] shadow-vault overflow-hidden">
      {/* Vendor Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-3">
        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-xs font-bold text-[var(--text-3)]">
          {config.label[0]}
        </div>
        <div>
          <div className="font-semibold text-[15px]">{config.label}</div>
          <div className="text-[10px] text-[var(--text-3)] font-mono">{config.basePath}</div>
        </div>
        <div className="ml-auto text-[10px] text-[var(--text-4)] font-mono bg-[var(--surface-raised)] px-2.5 py-1 rounded-[var(--radius-sm)] border border-[var(--border)]">{config.authStyle}</div>
      </div>

      {/* Group Tabs */}
      {groups.length > 0 && (
        <div className="flex gap-1 px-4 pt-3 overflow-x-auto">
          {groups.map((g) => {
            const gId = g.hashKey.split(':')[1] || g.hashKey;
            return (
              <button
                key={g.hashKey}
                onClick={() => setActiveGroup(gId)}
                className={`focus-ring px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] whitespace-nowrap transition-all duration-[var(--duration-normal)] ease-out-expo ${
                  activeGroup === gId
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm'
                    : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Key Table */}
      <div className="px-4 py-3">
        {groups.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--text-3)]">
            {t.vendorCard.noGroups}
          </div>
        ) : loadingKeys ? (
          <div className="text-center py-8 text-sm text-[var(--text-3)]">{t.common.loading}</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3.5 bg-[var(--surface-raised)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-3)]">{t.vendorCard.summaryUsage}</div>
                <div className="text-[15px] font-semibold font-mono tabular-nums mt-1.5">{summary.calls.toLocaleString()}</div>
              </div>
              <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3.5 bg-[var(--surface-raised)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-3)]">{t.vendorCard.summaryTokens}</div>
                <div className="text-[15px] font-semibold font-mono tabular-nums mt-1.5">{totalTokens ? totalTokens.toLocaleString() : '—'}</div>
              </div>
              <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3.5 bg-[var(--surface-raised)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-3)]">{t.vendorCard.summaryCost}</div>
                <div className="text-[15px] font-semibold font-mono tabular-nums mt-1.5">
                  {keys.some(k => k.costUsd != null) ? formatUsd(summary.costUsd) : '—'}
                </div>
              </div>
            </div>

            {vendor === 'youragent' && (
              <div className="border border-black/10 rounded-xl overflow-hidden">
                {/* Budget header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-black/[0.03] border-b border-black/5">
                  <span className="text-[11px] font-semibold text-black/60 flex items-center gap-1.5">
                    {t.vendorCard.budgetLabel}{' '}
                    {editingBudget ? (
                      <>
                        $<input
                          ref={budgetInputRef}
                          value={budgetInput}
                          onChange={e => setBudgetInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setEditingBudget(false); }}
                          className="w-16 border border-black/20 rounded px-1 text-black font-mono text-[11px] outline-none focus:border-black/40"
                        />
                        <button onClick={saveBudget} className="text-black/50 hover:text-green-600"><Check size={11} /></button>
                        <button onClick={() => setEditingBudget(false)} className="text-black/50 hover:text-red-500"><X size={11} /></button>
                      </>
                    ) : (
                      <>
                        ${budgetUsd % 1 === 0 ? budgetUsd.toFixed(0) : budgetUsd.toFixed(2)}
                        <button onClick={startEditBudget} className="text-black/30 hover:text-black/60"><Pencil size={10} /></button>
                      </>
                    )}
                  </span>
                  <span className="text-[11px] text-black/40 font-mono">{t.vendorCard.budgetRemaining}: {formatUsd(budgetRemainingUsd)}</span>
                </div>

                {/* Cost comparison grid */}
                <div className="grid grid-cols-3 divide-x divide-black/5">
                  <div className="px-4 py-3 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-black/40 mb-1">{t.vendorCard.budgetUsed}</div>
                    <div className="text-lg font-bold font-mono tabular-nums">{formatUsd(summary.costUsd)}</div>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-black/40 mb-1">{t.vendorCard.claudeOfficial}</div>
                    <div className="text-lg font-mono tabular-nums text-black/40 line-through">{formatUsd(claudeOfficialCostUsd)}</div>
                  </div>
                  <div className="px-4 py-3 text-center bg-green-50/50">
                    <div className="text-[10px] uppercase tracking-widest text-green-600 mb-1">{t.vendorCard.savings}</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-green-600">{formatUsd(diffUsd)}</div>
                  </div>
                </div>

                {/* Explanation */}
                <div className="px-4 py-2 bg-black/[0.02] border-t border-black/5">
                  <p className="text-[10px] text-black/35 leading-relaxed">{t.vendorCard.costNote}</p>
                </div>
              </div>
            )}

            <KeyTable keys={keys} onDeleted={loadKeys} />
          </div>
        )}
      </div>
    </div>
  );
}
