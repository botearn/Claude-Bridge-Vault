'use client';

import React, { useState, useEffect } from 'react';
import { X, Zap, CreditCard, Wallet } from 'lucide-react';
import { useLang } from './LangContext';

interface StripeCheckoutModalProps {
  onClose: () => void;
  currentBalance?: number;
}

type TabType = 'preset' | 'custom';

interface Preset {
  amount: number;
  badgeKey?: 'badgePopular' | 'badgeRecommended';
}

const PRESETS: Preset[] = [
  { amount: 5 },
  { amount: 10,  badgeKey: 'badgePopular' },
  { amount: 20 },
  { amount: 50,  badgeKey: 'badgeRecommended' },
  { amount: 100 },
  { amount: 200 },
];

export function StripeCheckoutModal({ onClose, currentBalance }: StripeCheckoutModalProps) {
  const { t } = useLang();
  const u = t.topUp;

  const [tab, setTab] = useState<TabType>('preset');
  const [selected, setSelected] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const finalAmount = tab === 'preset' ? selected : (parseFloat(customAmount) || 0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleCheckout() {
    if (finalAmount < 1) { setError(u.errorMin); return; }
    if (finalAmount > 10000) { setError(u.errorMax); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: finalAmount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? u.errorNetwork); return; }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(u.errorNetwork);
    } catch {
      setError(u.errorNetwork);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-xl)] shadow-vault-lg border border-[var(--border)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <Wallet size={14} className="text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">{u.title}</div>
              <div className="text-[11px] text-[var(--text-3)]">{u.subtitle}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-hover)] transition-colors text-[var(--text-3)] hover:text-[var(--text)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Balance */}
        {currentBalance !== undefined && (
          <div className="mx-6 mt-5 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between">
            <span className="text-[12px] text-black/40">{u.currentBalance}</span>
            <div className="flex items-center gap-1 text-[18px] font-bold font-mono tabular-nums text-amber-500">
              <Zap size={14} className="fill-amber-400 stroke-amber-400" />
              {currentBalance.toFixed(2)}
            </div>
          </div>
        )}

        {/* Tab toggle */}
        <div className="px-6 mt-5">
          <div className="flex gap-1 bg-[var(--surface-raised)] rounded-lg p-1 w-fit">
            {(['preset', 'custom'] as TabType[]).map((tabKey) => (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                className={`px-4 py-1.5 text-[12px] font-medium rounded-md transition-all ${
                  tab === tabKey
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                {tabKey === 'preset' ? u.tabPreset : u.tabCustom}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pt-4 pb-6">
          {tab === 'preset' ? (
            <>
              <p className="text-[11px] text-[var(--text-3)] mb-3">{u.selectAmount}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {PRESETS.map((p) => {
                  const active = selected === p.amount;
                  return (
                    <button
                      key={p.amount}
                      type="button"
                      onClick={() => setSelected(p.amount)}
                      className={`relative flex flex-col items-center justify-center py-4 rounded-xl border-2 transition-all duration-150 ${
                        active
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-hover)] hover:shadow-sm'
                      }`}
                    >
                      {p.badgeKey && (
                        <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          p.badgeKey === 'badgeRecommended' ? 'bg-blue-500 text-white' : 'bg-[var(--surface-raised)] text-[var(--text-3)] border border-[var(--border)]'
                        }`}>
                          {u[p.badgeKey]}
                        </span>
                      )}
                      <div className={`flex items-center gap-0.5 text-[17px] font-bold tabular-nums ${active ? 'text-blue-600' : 'text-[var(--text)]'}`}>
                        <Zap size={13} className={active ? 'fill-blue-400 stroke-blue-400' : 'fill-amber-400 stroke-amber-400'} />
                        {p.amount.toFixed(2)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-1">
              <label className="text-[11px] text-[var(--text-3)] block mb-2">{u.customLabel}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] text-sm font-mono">$</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="10000"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={u.customPlaceholder}
                  className="w-full border border-[var(--border)] rounded-xl pl-7 pr-4 py-3 text-sm font-mono bg-[var(--surface)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="mt-4 flex items-center justify-between px-4 py-3 bg-[var(--surface-raised)] rounded-xl">
            <span className="text-[12px] text-[var(--text-3)]">{u.summary}</span>
            <span className="font-mono font-bold text-sm tabular-nums">
              ${finalAmount > 0 ? finalAmount.toFixed(2) : '—'}
            </span>
          </div>

          {error && (
            <p className="mt-3 text-[12px] text-[var(--danger)] bg-[var(--danger-bg)] border border-[var(--danger)]/20 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading || finalAmount < 1}
            className="mt-4 w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard size={14} />
            {loading ? u.checkoutBtnLoading : u.checkoutBtn(`$${finalAmount > 0 ? finalAmount.toFixed(2) : '—'}`)}
          </button>

          <p className="mt-3 text-center text-[11px] text-[var(--text-4)]">
            {u.secureNote}
          </p>
        </div>
      </div>
    </div>
  );
}
