'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId, SubKeyData, KeyScope } from '@/lib/types';
import { KeyTable } from './KeyTable';
import { useLang } from './LangContext';
import { onVaultSync } from '@/lib/vaultSync';

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
            {/* Usage + Cost panel — all vendors */}
            <div className="border border-black/10 rounded-xl overflow-hidden">
              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-black/5">
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-black/40 mb-1">{t.vendorCard.summaryUsage}</div>
                  <div className="text-lg font-semibold font-mono tabular-nums">{summary.calls.toLocaleString()}</div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-black/40 mb-1">{t.vendorCard.summaryTokens}</div>
                  <div className="text-lg font-semibold font-mono tabular-nums">{totalTokens ? totalTokens.toLocaleString() : '—'}</div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-black/40 mb-1">{t.vendorCard.summaryCost}</div>
                  <div className="text-lg font-bold font-mono tabular-nums">
                    {keys.some(k => k.costUsd != null) ? formatUsd(summary.costUsd) : '—'}
                  </div>
                </div>
              </div>

              {/* Pricing note — all vendors */}
              <div className="px-4 py-2 bg-black/[0.015] border-t border-black/5">
                <p className="text-[10px] text-black/35 leading-relaxed">
                  {vendor === 'claude' ? t.vendorCard.costNoteClaude : t.vendorCard.costNoteYunwu}
                </p>
              </div>
            </div>

            <KeyTable keys={keys} onDeleted={loadKeys} />
          </div>
        )}
      </div>
    </div>
  );
}
