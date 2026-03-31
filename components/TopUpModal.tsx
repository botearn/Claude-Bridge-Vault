'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Wallet, Search, CheckCircle } from 'lucide-react';
import { useLang } from './LangContext';

interface TopUpModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultEmail?: string;
}

const PRESETS = [5, 10, 20, 50, 100];

export function TopUpModal({ onClose, onSuccess, defaultEmail = '' }: TopUpModalProps) {
  const { t } = useLang();
  const l = t.dashboard;

  const [email, setEmail] = useState(defaultEmail);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!email.trim() || !num || num <= 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/manage/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), amountUsd: num }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewBalance(data.balanceUsd);
        successTimer.current = setTimeout(onSuccess, 1500);
      } else {
        setError(data.error || 'Failed');
      }
    } catch {
      setError(t.dashboard.topUpNetworkError);
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

        {newBalance !== null ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle className="mx-auto text-[var(--success)]" size={32} />
            <div className="text-2xl font-bold font-mono text-[var(--success)]">
              ${newBalance.toFixed(2)}
            </div>
            <p className="text-sm text-[var(--text-3)]">{l.topUpSuccess}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-widest block mb-1.5">
                {l.topUpUserEmail}
              </label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoFocus
                  className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] pl-8 pr-3 py-2 text-sm bg-[var(--surface-raised)] focus:border-[var(--border-hover)] transition-colors"
                />
              </div>
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
                    className={`focus-ring flex-1 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] border transition-all ${
                      amount === String(p)
                        ? 'bg-[var(--success)] text-white border-transparent'
                        : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-hover)] bg-[var(--surface-raised)]'
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
                placeholder={t.dashboard.topUpCustomAmount}
                className="focus-ring w-full border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm font-mono bg-[var(--surface-raised)] focus:border-[var(--border-hover)] transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !amount || parseFloat(amount) <= 0}
              className="focus-ring w-full py-2.5 bg-[var(--success)] text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading
                ? t.common.saving
                : `${l.topUp} $${parseFloat(amount || '0').toFixed(2)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
