'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Shield, Plus, Zap, BarChart2, TrendingUp, Key, Wallet, PlusCircle, SlidersHorizontal } from 'lucide-react';
import { CreateKeyModal } from '@/components/CreateKeyModal';
import { TopUpModal } from '@/components/TopUpModal';
import { StripeCheckoutModal } from '@/components/StripeCheckoutModal';
import { KeyTable } from '@/components/KeyTable';
import { useLang, LangToggle } from '@/components/LangContext';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { SubKeyData, VendorId, KeyScope } from '@/lib/types';

interface KeyRow extends SubKeyData {
  key: string;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.001) return '<$0.001';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export default function VaultDashboard() {
  const { t } = useLang();
  const [showCreate, setShowCreate] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showStripe, setShowStripe] = useState(false);
  const [paymentToast, setPaymentToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  // Admin-only filters
  const [adminVendor, setAdminVendor] = useState<VendorId | ''>('');
  const [adminScope, setAdminScope] = useState<KeyScope | ''>('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => data?.user && setUserInfo(data.user))
      .catch(() => {});
  }, []);

  const fetchBalance = useCallback(() => {
    fetch('/api/v1/manage/balance')
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setBalance(data.balanceUsd))
      .catch(() => {});
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const params = new URLSearchParams();
      if (adminVendor) params.set('vendor', adminVendor);
      if (adminScope) params.set('scope', adminScope);
      const qs = params.toString();
      const res = await fetch(`/api/v1/manage/keys${qs ? `?${qs}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        const rows: KeyRow[] = Object.entries(data).map(([key, val]) => ({
          key,
          ...(val as SubKeyData),
        }));
        rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setKeys(rows);
      }
    } catch {
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  }, [adminVendor, adminScope]);

  useEffect(() => { fetchBalance(); }, [fetchBalance, refreshToken]);
  useEffect(() => { fetchKeys(); }, [fetchKeys, refreshToken, adminVendor, adminScope]);

  // Handle Stripe redirect back
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const payment = sp.get('payment');
    if (payment === 'success') {
      setPaymentToast(t.dashboard.paymentSuccess);
      fetchBalance();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setPaymentToast(''), 4000);
      window.history.replaceState({}, '', '/vault');
    } else if (payment === 'cancelled') {
      setPaymentToast(t.dashboard.paymentCancelled);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setPaymentToast(''), 3000);
      window.history.replaceState({}, '', '/vault');
    }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchBalance]);

  const handleCreated = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* best-effort */ }
    window.location.href = '/login';
  };

  // Stats derived from loaded keys
  const stats = keys.reduce(
    (acc, k) => {
      acc.totalCalls += k.usage || 0;
      acc.totalTokens += (k.inputTokens || 0) + (k.outputTokens || 0);
      acc.totalCost += k.costUsd || 0;
      return acc;
    },
    { totalCalls: 0, totalTokens: 0, totalCost: 0 },
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8 pb-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-[var(--radius-md)] bg-[var(--text)] flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
                Token Bank
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-md text-[var(--text-3)]">
                  v2
                </span>
              </h1>
              <p className="text-[13px] text-[var(--text-2)] mt-0.5">API key management</p>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowStripe(true)}
              className="focus-ring flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-sm text-[var(--text-2)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all duration-[var(--duration-normal)]"
            >
              <PlusCircle size={13} />
              {t.dashboard.recharge}
            </button>
            {userInfo?.role === 'admin' && (
              <button
                onClick={() => setShowTopUp(true)}
                title={t.dashboard.topUp}
                className="focus-ring p-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--success)] hover:border-[var(--success)]/40 hover:bg-[var(--success)]/5 transition-all duration-[var(--duration-normal)]"
              >
                <Wallet size={13} />
              </button>
            )}
          </div>
        </header>

        {/* Stats */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-vault mb-6 px-5 py-4">
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: <Zap size={12} />, label: t.analytics.totalCalls, value: fmtNum(stats.totalCalls) },
              { icon: <BarChart2 size={12} />, label: t.analytics.totalTokens, value: fmtNum(stats.totalTokens) },
              { icon: <TrendingUp size={12} />, label: t.analytics.estCost, value: fmtUsd(stats.totalCost) },
              { icon: <Key size={12} />, label: t.analytics.activeKeys, value: String(keys.length) },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[var(--text-3)]">
                  {icon}
                  <span className="text-[9px] font-medium uppercase tracking-[0.15em]">{label}</span>
                </div>
                <div className="text-[18px] font-semibold font-mono tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Admin filter bar — only visible to admins */}
        {userInfo?.role === 'admin' && (
          <div className="mb-4 flex items-center gap-3 px-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)]">
              <SlidersHorizontal size={11} />
              Admin filters
            </div>

            {/* Vendor filter */}
            <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-0.5 gap-0.5">
              {([['', 'All vendors'], ...Object.entries(VENDOR_CONFIG).map(([k, v]) => [k, v.label])] as [string, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAdminVendor(val as VendorId | '')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-[5px] transition-all ${
                    adminVendor === val
                      ? 'bg-[var(--text)] text-white shadow-sm'
                      : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Scope filter */}
            <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-0.5 gap-0.5">
              {([['', 'All scopes'], ['internal', 'Internal'], ['external', 'External']] as [string, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setAdminScope(val as KeyScope | '')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-[5px] transition-all ${
                    adminScope === val
                      ? val === 'internal'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : val === 'external'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-[var(--text)] text-white shadow-sm'
                      : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(adminVendor || adminScope) && (
              <button
                onClick={() => { setAdminVendor(''); setAdminScope(''); }}
                className="text-[10px] text-[var(--text-4)] hover:text-[var(--text-2)] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Keys panel */}
        <div className="border border-[var(--border)] rounded-[var(--radius-xl)] bg-[var(--surface)] shadow-vault overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-[var(--text-3)]" />
              <span className="font-semibold text-[15px]">
                {adminVendor || adminScope
                  ? `Keys · ${[adminVendor, adminScope].filter(Boolean).join(' / ')}`
                  : 'My Keys'}
              </span>
              {keys.length > 0 && (
                <span className="text-[11px] font-mono text-[var(--text-4)] bg-[var(--surface-raised)] px-2 py-0.5 rounded border border-[var(--border)]">
                  {keys.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="focus-ring flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-all"
            >
              <Plus size={12} />
              New Key
            </button>
          </div>

          <div className="px-4 py-3">
            {loadingKeys ? (
              <div className="text-center py-10 text-sm text-[var(--text-3)]">{t.common.loading}</div>
            ) : keys.length === 0 ? (
              <div className="text-center py-12">
                <Key size={28} className="mx-auto text-[var(--text-4)] mb-3" />
                <p className="text-sm text-[var(--text-3)] mb-4">No keys yet</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
                >
                  <Plus size={14} />
                  Create your first key
                </button>
              </div>
            ) : (
              <KeyTable keys={keys} onDeleted={fetchKeys} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-black/5">
          <p className="text-center text-[10px] text-black/25 font-mono">{t.dashboard.footerLabel}</p>
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onSuccess={() => { fetchBalance(); setShowTopUp(false); }}
          defaultEmail={userInfo?.email}
        />
      )}

      {showStripe && (
        <StripeCheckoutModal onClose={() => setShowStripe(false)} currentBalance={balance ?? undefined} />
      )}

      {paymentToast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-[var(--radius-md)] border text-sm font-medium shadow-vault-lg transition-all ${
          paymentToast.includes('success') || paymentToast.includes('成功')
            ? 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]'
            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-2)]'
        }`}>
          {paymentToast}
        </div>
      )}
    </div>
  );
}
