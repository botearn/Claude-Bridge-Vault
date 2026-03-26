'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Shield, Plus, LogOut, Zap, BarChart2, TrendingUp, Key, ExternalLink, Lock, Globe, Wallet, User } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId, KeyScope } from '@/lib/types';
import { VendorCard } from '@/components/VendorCard';
import { CreateKeyModal } from '@/components/CreateKeyModal';
import { TopUpModal } from '@/components/TopUpModal';
import { useLang, LangToggle } from '@/components/LangContext';

const VENDORS: VendorId[] = ['youragent', 'claude', 'yunwu'];

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

interface AnalyticsSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  activeKeys: number;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export default function VaultDashboard() {
  const { t } = useLang();
  const [activeScope, setActiveScope] = useState<KeyScope>('internal');
  const [activeVendor, setActiveVendor] = useState<VendorId>('youragent');
  const [showCreate, setShowCreate] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

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

  useEffect(() => { fetchBalance(); }, [fetchBalance, refreshToken]);

  useEffect(() => {
    fetch('/api/v1/manage/analytics')
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setSummary(data.summary))
      .catch(() => {});
  }, [refreshToken]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handleCreated = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

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
              <p className="text-[13px] text-[var(--text-2)] mt-0.5">{t.dashboard.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Balance */}
            {balance !== null && (
              <button
                onClick={() => userInfo?.role === 'admin' && setShowTopUp(true)}
                className={`focus-ring flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-sm font-mono tabular-nums transition-all duration-[var(--duration-normal)] ${
                  userInfo?.role === 'admin' ? 'hover:border-[var(--border-hover)] hover:bg-[var(--surface)] cursor-pointer' : 'cursor-default'
                }`}
                title={userInfo?.role === 'admin' ? t.dashboard.topUp : undefined}
              >
                <Wallet size={13} className="text-[var(--success)]" />
                <span className={balance > 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                  ${balance.toFixed(2)}
                </span>
              </button>
            )}

            {/* User */}
            {userInfo && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-sm">
                <User size={13} className="text-[var(--text-3)]" />
                <span className="text-[var(--text-2)] max-w-[100px] truncate">{userInfo.name}</span>
                {userInfo.role === 'admin' && (
                  <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">admin</span>
                )}
              </div>
            )}

            <LangToggle />
            <button
              onClick={() => setShowCreate(true)}
              className="focus-ring flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity duration-[var(--duration-fast)]"
            >
              <Plus size={15} strokeWidth={2.5} />
              {t.dashboard.newKey}
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="focus-ring p-2.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text)] hover:border-[var(--border-hover)] hover:bg-[var(--surface)] transition-all duration-[var(--duration-normal)]"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Analytics Summary */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-vault mb-6 px-5 py-4">
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-3)]">{t.dashboard.analytics}</span>
            <a href="/analytics" className="focus-ring flex items-center gap-1 text-[10px] text-[var(--text-4)] hover:text-[var(--text-2)] transition-colors">
              <ExternalLink size={10} />
              <span>{t.analytics.title}</span>
            </a>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: <Zap size={12} />, label: t.analytics.totalCalls, value: summary ? fmtNum(summary.totalCalls) : '—' },
              { icon: <BarChart2 size={12} />, label: t.analytics.totalTokens, value: summary ? fmtNum(summary.totalTokens) : '—' },
              { icon: <TrendingUp size={12} />, label: t.analytics.estCost, value: summary ? fmtUsd(summary.totalCostUsd) : '—' },
              { icon: <Key size={12} />, label: t.analytics.activeKeys, value: summary ? String(summary.activeKeys) : '—' },
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

        {/* Scope Toggle + Vendor Rail */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-4">
            {/* Scope */}
            <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-0.5">
              {(['internal', 'external'] as KeyScope[]).map((s) => {
                const active = activeScope === s;
                const isInternal = s === 'internal';
                return (
                  <button
                    key={s}
                    onClick={() => setActiveScope(s)}
                    className={`focus-ring flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-[7px] transition-all duration-[var(--duration-normal)] ease-out-expo ${
                      active
                        ? isInternal
                          ? 'bg-[var(--scope-internal)] text-white shadow-sm'
                          : 'bg-[var(--scope-external)] text-white shadow-sm'
                        : 'text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {isInternal ? <Lock size={12} /> : <Globe size={12} />}
                    {isInternal ? t.dashboard.scopeInternal : t.dashboard.scopeExternal}
                  </button>
                );
              })}
            </div>

            {/* Scope description */}
            <span className="text-[11px] text-[var(--text-4)]">
              {activeScope === 'internal' ? t.dashboard.scopeInternalDesc : t.dashboard.scopeExternalDesc}
            </span>

            {/* Divider */}
            <div className="w-px h-6 bg-[var(--border)] ml-auto" />

            {/* Vendor Rail */}
            <div className="flex gap-1.5">
              {VENDORS.map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveVendor(v)}
                  className={`focus-ring flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-md)] text-[13px] font-medium transition-all duration-[var(--duration-normal)] ease-out-expo border ${
                    activeVendor === v
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent shadow-sm'
                      : 'border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-hover)] bg-[var(--surface)]'
                  }`}
                >
                  <span>{VENDOR_CONFIG[v].label}</span>
                  <span className={`text-[10px] font-mono ${activeVendor === v ? 'text-white/40' : 'text-[var(--text-4)]'}`}>
                    {VENDOR_CONFIG[v].keyPrefix}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active Vendor Card */}
        <VendorCard key={`${activeVendor}-${activeScope}-${refreshToken}`} vendor={activeVendor} scope={activeScope} />

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-black/5">
          <p className="text-center text-[10px] text-black/25 font-mono">{t.dashboard.footerLabel}</p>
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} defaultScope={activeScope} />
      )}

      {showTopUp && (
        <TopUpModal
          onClose={() => setShowTopUp(false)}
          onSuccess={() => { fetchBalance(); setShowTopUp(false); }}
          currentUserId={userInfo?.id}
        />
      )}
    </div>
  );
}
