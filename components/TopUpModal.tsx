'use client';

import React, { useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { useLang } from './LangContext';

interface TopUpModalProps {
  onClose: () => void;
  onSuccess: () => void;
  currentUserId?: string;
}

const PRESETS = [5, 10, 20, 50, 100];

export function TopUpModal({ onClose, onSuccess, currentUserId }: TopUpModalProps) {
  const { t } = useLang();
  const l = t.dashboard;
  const [amount, setAmount] = useState('');
  const [targetUserId, setTargetUserId] = useState(currentUserId ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ balanceUsd: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/manage/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, amountUsd: num }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setTimeout(onSuccess, 1200);
      } else {
        setError(data.error || 'Failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50">
      <div className="relative w-full max-w-sm bg-[var(--surface)] rounded-[var(--radius-xl)] border border-[var(--border)] shadow-vault-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-4)] hover:text-[var(--text-2)] transition-colors"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Wallet size={16} className="text-[var(--success)]" />
          <h2 className="text-base font-bold">{l.topUp}</h2>
        </div>

        {result ? (
          <div className="text-center py-6">
            <div className="text-3xl font-bold font-mono text-[var(--success)] mb-2">
              ${result.balanceUsd.toFixed(2)}
            </div>
            <p className="text-sm text-[var(--text-3)]">{l.topUpSuccess}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User ID */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-1.5">
                User ID
              </label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm font-mono bg-[var(--surface-raised)] focus:border-[var(--border-hover)] transition-colors"
              />
            </div>

            {/* Amount presets */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-1.5">
                {l.topUpAmount}
              </label>
              <div className="flex gap-1.5 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(String(p))}
                    className={`focus-ring flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-all ${
                      amount === String(p)
                        ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                        : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-hover)]'
                    }`}
                  >
                    ${p}
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Custom amount (USD)"
                className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm font-mono bg-[var(--surface-raised)] focus:border-[var(--border-hover)] transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="focus-ring w-full py-2.5 bg-[var(--success)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading ? t.common.saving : `${l.topUp} $${parseFloat(amount || '0').toFixed(2)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
