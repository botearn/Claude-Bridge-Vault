'use client';

import React, { useState } from 'react';
import { Plus, Trash2, X, Pencil, Check } from 'lucide-react';
import type { VendorId } from '@/lib/types';
import { useLang } from './LangContext';
import { emitVaultSync } from '@/lib/vaultSync';

interface GroupOption {
  hashKey: string;
  label: string;
}

interface GroupManagerProps {
  vendor: VendorId;
  groups: GroupOption[];
  onGroupsChanged: () => void;
}

export function GroupManager({ vendor, groups, onGroupsChanged }: GroupManagerProps) {
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleAdd = async () => {
    if (!groupId.trim() || !newLabel.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/manage/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, groupId: groupId.trim(), label: newLabel.trim() }),
      });
      if (res.ok) {
        setGroupId('');
        setNewLabel('');
        setAdding(false);
        onGroupsChanged();
        emitVaultSync({ source: 'group-add', vendor, group: groupId.trim() });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (g: GroupOption) => {
    setEditingKey(g.hashKey);
    setEditLabel(g.label);
  };

  const handleSaveEdit = async (hashKey: string) => {
    if (!editLabel.trim()) return;
    await fetch('/api/v1/manage/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: hashKey, label: editLabel.trim() }),
    });
    setEditingKey(null);
    onGroupsChanged();
    emitVaultSync({ source: 'group-edit', vendor, group: hashKey.split(':')[1] || hashKey });
  };

  const handleDelete = async (hashKey: string) => {
    if (!confirm(t.groupManager.deleteConfirm)) return;
    await fetch('/api/v1/manage/groups', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: hashKey }),
    });
    onGroupsChanged();
    emitVaultSync({ source: 'group-delete', vendor, group: hashKey.split(':')[1] || hashKey });
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-2">
        {t.groupManager.label}
      </div>

      {groups.map((g) => (
        <div
          key={g.hashKey}
          className="flex items-center justify-between px-3 py-2 border border-black/5 rounded-lg bg-black/[0.01]"
        >
          {editingKey === g.hashKey ? (
            <input
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(g.hashKey);
                if (e.key === 'Escape') setEditingKey(null);
              }}
              className="flex-1 text-sm border-b border-black/20 bg-transparent focus:outline-none mr-2"
            />
          ) : (
            <span className="text-sm flex-1">{g.label}</span>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            <code className="text-[10px] text-black/30 font-mono">{g.hashKey.split(':')[1]}</code>

            {editingKey === g.hashKey ? (
              <>
                <button
                  onClick={() => handleSaveEdit(g.hashKey)}
                  className="p-1 rounded hover:bg-green-50 text-black/30 hover:text-green-600 transition-colors ml-1"
                >
                  <Check size={11} />
                </button>
                <button
                  onClick={() => setEditingKey(null)}
                  className="p-1 rounded hover:bg-black/5 text-black/30 transition-colors"
                >
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleEdit(g)}
                  className="p-1 rounded hover:bg-black/5 text-black/20 hover:text-black transition-colors ml-1"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => handleDelete(g.hashKey)}
                  className="p-1 rounded hover:bg-red-50 text-black/20 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="border border-black/10 rounded-lg p-3 space-y-2">
          <input
            type="text"
            placeholder={t.groupManager.groupIdPlaceholder}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full border border-black/10 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-black/30"
          />
          <input
            type="text"
            placeholder={t.groupManager.groupLabelPlaceholder}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full border border-black/10 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-black/30"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading || !groupId.trim() || !newLabel.trim()}
              className="flex-1 py-1.5 text-xs font-semibold bg-black text-white rounded-md hover:bg-black/80 disabled:opacity-40 transition-colors"
            >
              {loading ? t.common.adding : t.common.add}
            </button>
            <button
              onClick={() => { setAdding(false); setGroupId(''); setNewLabel(''); }}
              className="p-1.5 border border-black/10 rounded-md hover:bg-black/5 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-black/40 hover:text-black transition-colors"
        >
          <Plus size={12} /> {t.groupManager.addGroup}
        </button>
      )}
    </div>
  );
}
