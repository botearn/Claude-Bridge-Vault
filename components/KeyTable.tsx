'use client';

import React, { useState } from 'react';
import { Copy, Check, Trash2, Share2 } from 'lucide-react';
import type { SubKeyData } from '@/lib/types';
import { ShareSnippet } from './ShareSnippet';
import { useLang } from './LangContext';
import { emitVaultSync } from '@/lib/vaultSync';

interface KeyRow extends SubKeyData {
  key: string;
}

interface KeyTableProps {
  keys: KeyRow[];
  onDeleted: () => void;
}

function TruncatedKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = value.length > 24 ? value.slice(0, 12) + '...' + value.slice(-6) : value;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1.5">
      <code className="font-mono text-xs text-black/60">{truncated}</code>
      <button onClick={handleCopy} className="p-1 rounded hover:bg-black/5 transition-colors">
        {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} className="text-black/30" />}
      </button>
    </div>
  );
}

export function KeyTable({ keys, onDeleted }: KeyTableProps) {
  const { t } = useLang();
  const [shareKey, setShareKey] = useState<KeyRow | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const formatUsd = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '$0.00';
    if (n < 0.01) return '<$0.01';
    return `$${n.toFixed(2)}`;
  };

  const handleDelete = async (key: string) => {
    if (!confirm(t.keyTable.deleteConfirm)) return;
    setDeletingKey(key);
    try {
      await fetch('/api/v1/manage/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subKey: key }),
      });
      onDeleted();
      emitVaultSync({ source: 'key-delete', subKey: key });
    } finally {
      setDeletingKey(null);
    }
  };

  if (keys.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-black/30">{t.keyTable.noKeys}</div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 text-[10px] font-semibold text-black/40 uppercase tracking-widest">
              <th className="text-left py-2 pr-4">{t.keyTable.name}</th>
              <th className="text-left py-2 pr-4">Model</th>
              <th className="text-left py-2 pr-4">{t.keyTable.key}</th>
              <th className="text-right py-2 pr-4">{t.keyTable.usage}</th>
              <th className="text-right py-2 pr-4">{t.keyTable.tokens}</th>
              <th className="text-right py-2 pr-4">{t.keyTable.cost}</th>
              <th className="text-left py-2 pr-4">{t.keyTable.lastUsed}</th>
              <th className="text-right py-2"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => (
              (() => {
                const tokens = (row.inputTokens || 0) + (row.outputTokens || 0);
                const cost = row.costUsd || 0;
                return (
              <tr key={row.key} className="border-b border-black/5 hover:bg-black/[0.01] transition-colors">
                <td className="py-3 pr-4 font-medium">{row.name}</td>
                <td className="py-3 pr-4">
                  <span className="text-xs font-mono bg-black/5 px-1.5 py-0.5 rounded text-black/60">
                    {row.model ?? row.vendor}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <TruncatedKey value={row.key} />
                </td>
                <td className="py-3 pr-4 text-right font-mono text-xs">{row.usage}</td>
                <td className="py-3 pr-4 text-right font-mono text-xs">
                  {tokens ? tokens.toLocaleString() : '—'}
                </td>
                <td className="py-3 pr-4 text-right font-mono text-xs">
                  {row.costUsd != null ? formatUsd(cost) : '—'}
                </td>
                <td className="py-3 pr-4 text-xs text-black/40">
                  {row.lastUsed ? new Date(row.lastUsed).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setShareKey(row)}
                      className="p-1.5 rounded hover:bg-black/5 transition-colors text-black/40 hover:text-black"
                    >
                      <Share2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(row.key)}
                      disabled={deletingKey === row.key}
                      className="p-1.5 rounded hover:bg-red-50 transition-colors text-black/20 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
                );
              })()
            ))}
          </tbody>
        </table>
      </div>

      {shareKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50">
          <div className="bg-white text-black border border-black/10 rounded-2xl w-full max-w-md p-8 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold">{t.keyTable.shareTitle}{shareKey.name}</h3>
              <button onClick={() => setShareKey(null)} className="text-black/40 hover:text-black">
                ✕
              </button>
            </div>
            <ShareSnippet subKey={shareKey.key} vendor={shareKey.vendor} />
            <button
              onClick={() => setShareKey(null)}
              className="w-full mt-4 py-2.5 border border-black rounded-lg text-sm font-semibold hover:bg-black hover:text-white transition-colors"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
