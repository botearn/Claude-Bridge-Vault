'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { VENDOR_CONFIG, isValidVendor } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';
import { ShareSnippet } from './ShareSnippet';
import { useLang } from './LangContext';
import { emitVaultSync } from '@/lib/vaultSync';

interface GroupOption {
  key: string;
  label: string;
}

interface CreateKeyModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateKeyModal({ onClose, onCreated }: CreateKeyModalProps) {
  const { t } = useLang();
  const [vendor, setVendor] = useState<VendorId>('claude');
  const [group, setGroup] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [name, setName] = useState('');
  const [totalQuota, setTotalQuota] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGroups(vendor);
  }, [vendor]);

  const loadGroups = async (v: VendorId) => {
    try {
      const res = await fetch(`/api/v1/manage/groups?vendor=${v}`);
      const data = await res.json();
      const opts: GroupOption[] = Object.entries(data).map(([key, val]) => ({
        key: key.split(':')[1] || key,
        label: (val as { label: string }).label,
      }));
      setGroups(opts);
      setGroup(opts[0]?.key || '');
    } catch {
      setGroups([]);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupId.trim() || !newGroupLabel.trim()) return;
    setError('');
    try {
      const res = await fetch('/api/v1/manage/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, groupId: newGroupId.trim(), label: newGroupLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.createKeyModal.errorNetworkGroup);
        return;
      }
      await loadGroups(vendor);
      setGroup(newGroupId.trim());
      setNewGroupId('');
      setNewGroupLabel('');
      setCreatingGroup(false);
      emitVaultSync({ source: 'create-group', vendor, group: newGroupId.trim() });
    } catch {
      setError(t.createKeyModal.errorNetworkGroup);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !group) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/manage/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          vendor,
          group,
          totalQuota: totalQuota ? parseInt(totalQuota, 10) : null,
          expiresAt: expiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t.createKeyModal.errorNetwork);
        return;
      }
      setCreatedKey(data.subKey);
      emitVaultSync({ source: 'create-key', vendor, group });
      onCreated();
    } catch {
      setError(t.createKeyModal.errorNetwork);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50">
      <div className="bg-white text-black border border-black/10 rounded-2xl w-full max-w-md p-8 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">{t.createKeyModal.title}</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X size={20} />
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <div className="text-sm text-black/60 mb-2">{t.createKeyModal.keyCreated}</div>
            <ShareSnippet subKey={createdKey} vendor={vendor} />
            <button
              onClick={onClose}
              className="w-full py-3 border border-black rounded-lg text-sm font-semibold hover:bg-black hover:text-white transition-colors mt-4"
            >
              {t.common.done}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Vendor Select */}
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1.5">
                {t.createKeyModal.vendor}
              </label>
              <div className="flex gap-2">
                {(Object.keys(VENDOR_CONFIG) as VendorId[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => { if (isValidVendor(v)) setVendor(v); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      vendor === v
                        ? 'bg-black text-white border-black'
                        : 'border-black/10 hover:border-black/30'
                    }`}
                  >
                    {VENDOR_CONFIG[v].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Group Select */}
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1.5">
                {t.createKeyModal.group}
              </label>
              {groups.length > 0 && (
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
                >
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              )}

              {creatingGroup ? (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    placeholder={t.createKeyModal.groupIdPlaceholder}
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
                  />
                  <input
                    type="text"
                    placeholder={t.createKeyModal.groupLabelPlaceholder}
                    value={newGroupLabel}
                    onChange={(e) => setNewGroupLabel(e.target.value)}
                    className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateGroup}
                      className="flex-1 py-2 text-xs font-semibold bg-black text-white rounded-lg hover:bg-black/80 transition-colors"
                    >
                      {t.createKeyModal.createGroup}
                    </button>
                    <button
                      onClick={() => setCreatingGroup(false)}
                      className="flex-1 py-2 text-xs font-semibold border border-black/10 rounded-lg hover:border-black/30 transition-colors"
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingGroup(true)}
                  className="mt-2 flex items-center gap-1.5 text-xs text-black/40 hover:text-black transition-colors"
                >
                  <Plus size={12} /> {t.createKeyModal.newGroup}
                </button>
              )}
            </div>

            {/* Name Input */}
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1.5">
                {t.createKeyModal.keyName}
              </label>
              <input
                type="text"
                placeholder={t.createKeyModal.keyNamePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
              />
            </div>

            {/* Quota + Expiry */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1.5">
                  {t.createKeyModal.totalQuota}{' '}
                  <span className="normal-case font-normal">({t.createKeyModal.optional})</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder={t.common.unlimited}
                  value={totalQuota}
                  onChange={(e) => setTotalQuota(e.target.value)}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-1.5">
                  {t.createKeyModal.expiresAt}{' '}
                  <span className="normal-case font-normal">({t.createKeyModal.optional})</span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black/30"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim() || !group}
              className="w-full py-3 border border-black rounded-lg text-sm font-semibold hover:bg-black hover:text-white transition-colors disabled:opacity-40"
            >
              {loading ? t.common.creating : t.createKeyModal.generateKey}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
