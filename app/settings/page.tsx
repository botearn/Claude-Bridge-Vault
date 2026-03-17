'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Pencil, Trash2, Check, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { SubKeyData, VendorId, KeyScope } from '@/lib/types';
import { useLang, LangToggle } from '@/components/LangContext';
import { GroupManager } from '@/components/GroupManager';
import { emitVaultSync, onVaultSync } from '@/lib/vaultSync';

interface KeyRow extends SubKeyData { key: string; }
interface GroupOption { hashKey: string; label: string; }

interface EditState {
  name: string;
  group: string;
  totalQuota: string;
  expiresAt: string;
}

function KeySettingsRow({
  row, groups, onSaved, onDeleted,
}: {
  row: KeyRow;
  groups: GroupOption[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t } = useLang();
  const s = t.settings;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditState>({
    name: row.name,
    group: row.group,
    totalQuota: row.totalQuota != null ? String(row.totalQuota) : '',
    expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
  });

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/v1/manage/keys/${encodeURIComponent(row.key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        group: form.group,
        totalQuota: form.totalQuota ? parseInt(form.totalQuota, 10) : null,
        expiresAt: form.expiresAt || null,
      }),
    });
    setSaving(false);
    setEditing(false);
    onSaved();
    emitVaultSync({ source: 'key-edit', vendor: row.vendor, group: form.group, subKey: row.key });
  };

  const handleDelete = async () => {
    if (!confirm(s.deleteConfirm(row.name))) return;
    await fetch('/api/v1/manage/keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subKey: row.key }),
    });
    onDeleted();
    emitVaultSync({ source: 'key-delete', vendor: row.vendor, group: row.group, subKey: row.key });
  };

  const usedTokens = (row.inputTokens || 0) + (row.outputTokens || 0);
  const remaining = row.totalQuota != null ? Math.max(0, row.totalQuota - usedTokens) : null;

  return (
    <div className="border border-[var(--border)] rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-[10px] rounded-full px-2 py-px uppercase tracking-wider flex-shrink-0 ${
            (row.scope ?? 'internal') === 'external'
              ? 'bg-amber-50 text-amber-600 border border-amber-200'
              : 'bg-blue-50 text-blue-600 border border-blue-200'
          }`}>
            {(row.scope ?? 'internal') === 'external' ? t.dashboard.scopeExternal : t.dashboard.scopeInternal}
          </span>
          <span className="text-[10px] border border-black/15 rounded-full px-2 py-px uppercase tracking-wider text-black/50 flex-shrink-0">
            {VENDOR_CONFIG[row.vendor].label}
          </span>
          <span className="text-[10px] text-black/30 border border-[var(--border)] rounded-full px-2 py-px flex-shrink-0">
            {groups.find(g => (g.hashKey.split(':')[1] || g.hashKey) === row.group)?.label ?? row.group}
          </span>
          <span className="text-sm font-medium truncate">{row.name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button onClick={() => setEditing(e => !e)} className="p-1.5 rounded hover:bg-black/5 text-black/30 hover:text-black transition-colors">
            {editing ? <ChevronUp size={14} /> : <Pencil size={13} />}
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded hover:bg-red-50 text-black/20 hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-black/40 font-mono border-t border-black/5 pt-2">
        <span>{row.usage} {s.calls}</span>
        <span>·</span>
        <span>
          {row.totalQuota != null
            ? `${usedTokens.toLocaleString()} ${s.used} · ${remaining!.toLocaleString()} ${s.remaining} / ${row.totalQuota.toLocaleString()} ${s.total}`
            : s.unlimitedQuota}
        </span>
        <span>·</span>
        <span>
          {row.expiresAt
            ? `${s.expires} ${new Date(row.expiresAt).toLocaleDateString()}`
            : s.noExpiry}
        </span>
      </div>

      {editing && (
        <div className="border-t border-black/5 px-4 py-4 bg-black/[0.01] space-y-3">
          <div>
            <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1">{s.name}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1">{s.group}</label>
            {groups.length > 0 ? (
              <select
                value={form.group}
                onChange={e => setForm(f => ({ ...f, group: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30 bg-white"
              >
                {groups.map(g => (
                  <option key={g.hashKey} value={g.hashKey.split(':')[1] || g.hashKey}>
                    {g.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.group}
                onChange={e => setForm(f => ({ ...f, group: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1">
                {s.totalQuota} <span className="normal-case font-normal">({s.blankUnlimited})</span>
              </label>
              <input
                type="number"
                min="1"
                placeholder={t.common.unlimited}
                value={form.totalQuota}
                onChange={e => setForm(f => ({ ...f, totalQuota: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1">
                {s.expiresAt} <span className="normal-case font-normal">({s.blankNever})</span>
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-semibold rounded-lg hover:bg-black/80 disabled:opacity-50 transition-colors"
            >
              <Check size={12} /> {saving ? t.common.saving : t.common.save}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1.5 px-4 py-2 border border-[var(--border)] text-xs rounded-lg hover:bg-black/5 transition-colors"
            >
              <X size={12} /> {t.common.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const s = t.settings;
  const [view, setView] = useState<'keys' | 'groups'>('keys');
  const [scopeFilter, setScopeFilter] = useState<KeyScope>('internal');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: scopeFilter });
      if (vendorFilter !== 'all') params.set('vendor', vendorFilter);
      const res = await fetch(`/api/v1/manage/keys?${params}`);
      const data = await res.json();
      const rows: KeyRow[] = Object.entries(data).map(([key, val]) => ({ key, ...(val as SubKeyData) }));
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setKeys(rows);
    } finally {
      setLoading(false);
    }
  }, [vendorFilter, scopeFilter]);

  const loadGroups = useCallback(async () => {
    try {
      const url = vendorFilter === 'all'
        ? '/api/v1/manage/groups'
        : `/api/v1/manage/groups?vendor=${vendorFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      const opts: GroupOption[] = Object.entries(data).map(([hashKey, val]) => ({
        hashKey,
        label: (val as { label: string }).label,
      }));
      setGroups(opts);
    } catch {
      setGroups([]);
    }
  }, [vendorFilter]);

  useEffect(() => { loadKeys(); loadGroups(); }, [loadKeys, loadGroups]);

  useEffect(() => {
    const off = onVaultSync((payload) => {
      if (vendorFilter !== 'all' && payload.vendor && payload.vendor !== vendorFilter) return;
      loadKeys();
      loadGroups();
    });
    return off;
  }, [vendorFilter, loadKeys, loadGroups]);

  // When vendor changes, reset to keys view
  const handleVendorChange = (v: string) => {
    setVendorFilter(v);
    if (v === 'all') setView('keys');
  };

  const vendors = ['all', ...Object.keys(VENDOR_CONFIG)] as const;

  // Pass groups for a key's vendor to each row
  const groupsForRow = (row: KeyRow) =>
    groups.filter(g => g.hashKey.startsWith(row.vendor + ':'));

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-10 border-b border-[var(--border)] pb-6">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[13px] text-black/40 hover:text-black transition-colors mr-1">&larr;</a>
            <div className="w-px h-5 bg-black/10" />
            <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
              <Settings className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                {s.title}
                <span className="text-[11px] px-2 py-0.5 border border-black/20 rounded-full uppercase">{s.badge}</span>
              </h1>
              <p className="text-sm text-black/60">{s.subtitle}</p>
            </div>
          </div>
          <LangToggle />
        </header>

        {/* Scope toggle */}
        <div className="flex items-center gap-1 mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 w-fit">
          {(['internal', 'external'] as KeyScope[]).map((sc) => (
            <button
              key={sc}
              onClick={() => setScopeFilter(sc)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                scopeFilter === sc
                  ? 'bg-black text-white'
                  : 'text-black/50 hover:text-black hover:bg-black/5'
              }`}
            >
              {sc === 'internal' ? t.dashboard.scopeInternal : t.dashboard.scopeExternal}
            </button>
          ))}
        </div>

        {/* Vendor filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {vendors.map(v => (
            <button
              key={v}
              onClick={() => handleVendorChange(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                vendorFilter === v
                  ? 'bg-black text-white border-black'
                  : 'border-[var(--border)] text-black/50 hover:text-black hover:border-black/20 bg-white'
              }`}
            >
              {v === 'all' ? s.allVendors : VENDOR_CONFIG[v as VendorId].label}
            </button>
          ))}
        </div>

        {/* Keys / Groups tab toggle */}
        <div className="flex items-center gap-1 mb-6 border-b border-black/8">
          <button
            onClick={() => setView('keys')}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              view === 'keys'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            {s.viewKeys}
          </button>
          <button
            onClick={() => setView('groups')}
            disabled={vendorFilter === 'all'}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px disabled:opacity-30 disabled:cursor-not-allowed ${
              view === 'groups'
                ? 'border-black text-black'
                : 'border-transparent text-black/40 hover:text-black'
            }`}
          >
            {s.viewGroups}
          </button>
          {vendorFilter === 'all' && (
            <span className="text-[10px] text-black/35 ml-2 italic">{s.selectVendorForGroups}</span>
          )}
        </div>

        {/* Groups view */}
        {view === 'groups' && vendorFilter !== 'all' && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-6">
            <GroupManager
              vendor={vendorFilter as VendorId}
              groups={groups}
              onGroupsChanged={loadGroups}
            />
          </div>
        )}

        {/* Keys view */}
        {view === 'keys' && (
          loading ? (
            <div className="text-center py-12 text-sm text-black/30">{t.common.loading}</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 border border-[var(--border)] rounded-[var(--radius-xl)] bg-white">
              <p className="text-sm text-black/30 mb-4">{s.noKeys}</p>
              <a href="/vault" className="inline-flex items-center gap-1.5 text-xs font-semibold border border-black px-4 py-2 rounded-lg hover:bg-black hover:text-white transition-colors">
                <Plus size={12} /> {s.createKey}
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map(row => (
                <KeySettingsRow
                  key={row.key}
                  row={row}
                  groups={groupsForRow(row)}
                  onSaved={() => { loadKeys(); loadGroups(); }}
                  onDeleted={loadKeys}
                />
              ))}
            </div>
          )
        )}

        <div className="mt-8 pt-4 border-t border-black/5 text-xs text-black/30 text-center">
          {s.footerKeys(keys.length)}
        </div>
      </div>
    </div>
  );
}
