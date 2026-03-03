'use client';

import React, { useState, useCallback } from 'react';
import { Shield, Plus, LogOut } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';
import { VendorCard } from '@/components/VendorCard';
import { CreateKeyModal } from '@/components/CreateKeyModal';
import { useLang, LangToggle } from '@/components/LangContext';

const VENDORS: VendorId[] = ['youragent', 'claude', 'openai', 'gemini'];

export default function VaultDashboard() {
  const { t } = useLang();
  const [activeVendor, setActiveVendor] = useState<VendorId>('youragent');
  const [showCreate, setShowCreate] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handleCreated = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-[#111] font-sans selection:bg-black/10">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-black/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                CLAUDE BRIDGE VAULT{' '}
                <span className="text-[11px] px-2 py-0.5 border border-black/20 rounded-full uppercase">
                  v2
                </span>
              </h1>
              <p className="text-sm text-black/60">{t.dashboard.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LangToggle />
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-black/80 transition-colors"
            >
              <Plus size={15} />
              {t.dashboard.newKey}
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-lg border border-black/10 text-black/40 hover:text-black hover:border-black/30 transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Vendor Rail */}
        <div className="flex gap-2 mb-8">
          {VENDORS.map((v) => (
            <button
              key={v}
              onClick={() => setActiveVendor(v)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                activeVendor === v
                  ? 'bg-black text-white border-black'
                  : 'border-black/10 text-black/60 hover:text-black hover:border-black/20 bg-white'
              }`}
            >
              <span className="font-mono text-xs">{VENDOR_CONFIG[v].label}</span>
              <span className={`text-[10px] font-mono ${activeVendor === v ? 'text-white/50' : 'text-black/30'}`}>
                {VENDOR_CONFIG[v].keyPrefix}
              </span>
            </button>
          ))}
        </div>

        {/* Active Vendor Card */}
        <VendorCard key={`${activeVendor}-${refreshToken}`} vendor={activeVendor} />

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-black/5 flex items-center justify-between text-xs text-black/30">
          <span>{t.dashboard.footerLabel}</span>
          <div className="flex items-center gap-2">
            <a href="/analytics" className="px-3 py-1.5 border border-black/20 rounded-lg text-xs font-medium hover:bg-black hover:text-white hover:border-black transition-colors">
              {t.dashboard.analytics}
            </a>
            <a href="/docs" className="px-3 py-1.5 border border-black/20 rounded-lg text-xs font-medium hover:bg-black hover:text-white hover:border-black transition-colors">
              {t.dashboard.docs}
            </a>
            <a href="/settings" className="px-3 py-1.5 border border-black/20 rounded-lg text-xs font-medium hover:bg-black hover:text-white hover:border-black transition-colors">
              {t.dashboard.settings}
            </a>
            <a href="/query" className="px-3 py-1.5 border border-black/20 rounded-lg text-xs font-medium hover:bg-black hover:text-white hover:border-black transition-colors">
              {t.dashboard.keyLookup}
            </a>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
