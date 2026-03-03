'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId, SubKeyData } from '@/lib/types';
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
  onRefreshNeeded?: () => void;
}

export function VendorCard({ vendor }: VendorCardProps) {
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
      const res = await fetch(`/api/v1/manage/keys?vendor=${vendor}&group=${activeGroup}`);
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
  }, [vendor, activeGroup]);

  useEffect(() => { loadGroups(); }, [vendor]);
  useEffect(() => { if (activeGroup) loadKeys(); }, [activeGroup]);

  useEffect(() => {
    const off = onVaultSync((payload) => {
      if (payload.vendor && payload.vendor !== vendor) return;
      loadGroups();
      if (activeGroup) loadKeys();
    });
    return off;
  }, [vendor, activeGroup, loadGroups, loadKeys]);

  return (
    <div className="border border-black/10 rounded-2xl bg-white/90 shadow-sm shadow-black/5 overflow-hidden">
      {/* Vendor Header */}
      <div className="px-6 py-4 border-b border-black/5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg border border-black/10 flex items-center justify-center text-xs font-bold text-black/50">
          {config.label[0]}
        </div>
        <div>
          <div className="font-semibold">{config.label}</div>
          <div className="text-[10px] text-black/40 font-mono">{config.basePath}</div>
        </div>
        <div className="ml-auto text-[10px] text-black/30 font-mono">{config.authStyle}</div>
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeGroup === gId
                    ? 'bg-black text-white'
                    : 'text-black/50 hover:text-black hover:bg-black/5'
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
          <div className="text-center py-6 text-sm text-black/30">
            {t.vendorCard.noGroups}
          </div>
        ) : loadingKeys ? (
          <div className="text-center py-6 text-sm text-black/30">{t.common.loading}</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-black/50">{t.vendorCard.summaryUsage}</div>
                <div className="text-sm font-semibold font-mono mt-1">{summary.calls.toLocaleString()}</div>
              </div>
              <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-black/50">{t.vendorCard.summaryTokens}</div>
                <div className="text-sm font-semibold font-mono mt-1">{totalTokens ? totalTokens.toLocaleString() : '—'}</div>
              </div>
              <div className="border border-black/10 rounded-xl p-3 bg-black/[0.02]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-black/50">{t.vendorCard.summaryCost}</div>
                <div className="text-sm font-semibold font-mono mt-1">
                  {keys.some(k => k.costUsd != null) ? formatUsd(summary.costUsd) : '—'}
                </div>
              </div>
            </div>
            <KeyTable keys={keys} onDeleted={loadKeys} />
          </div>
        )}
      </div>
    </div>
  );
}
