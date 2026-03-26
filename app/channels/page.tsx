'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight, ChevronDown, RefreshCw, Activity, AlertTriangle, CheckCircle2, ZapOff } from 'lucide-react';
import type { VendorId } from '@/lib/types';
import { VENDOR_CONFIG } from '@/lib/vendors';

interface ChannelHealth {
  failCount: number;
  lastError?: string;
  lastErrorAt?: string;
  lastSuccessAt?: string;
  circuitOpen: boolean;
  circuitOpenAt?: string;
}

interface Channel {
  id: string;
  vendor: VendorId;
  label: string;
  apiKey: string;
  enabled: boolean;
  weight: number;
  createdAt: string;
  health: ChannelHealth;
}

const VENDORS: VendorId[] = ['claude', 'youragent', 'yunwu'];

function HealthBadge({ health }: { health: ChannelHealth }) {
  if (health.circuitOpen) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200">
        <ZapOff size={9} /> 熔断
      </span>
    );
  }
  if (health.failCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-600 border border-yellow-200">
        <AlertTriangle size={9} /> 抖动 {health.failCount}次
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-600 border border-green-200">
      <CheckCircle2 size={9} /> 健康
    </span>
  );
}

function fmtTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeVendor, setActiveVendor] = useState<VendorId>('claude');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [probingId, setProbingId] = useState<string | null>(null);

  const [form, setForm] = useState({ label: '', apiKey: '', weight: '1', vendor: 'claude' as VendorId });
  const [editForm, setEditForm] = useState({ label: '', apiKey: '', weight: '1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/manage/channels/health');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels ?? []);
      }
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vendorChannels = channels.filter(c => c.vendor === activeVendor);

  async function handleAdd() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/v1/manage/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: form.vendor, label: form.label, apiKey: form.apiKey, weight: Number(form.weight) || 1, enabled: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Failed to add');
        return;
      }
      setShowAdd(false);
      setForm({ label: '', apiKey: '', weight: '1', vendor: 'claude' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ch: Channel) {
    const res = await fetch('/api/v1/manage/channels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor: ch.vendor, id: ch.id, enabled: !ch.enabled }),
    });
    if (!res.ok) { setError('Failed to update channel'); return; }
    await load();
  }

  async function handleDelete(ch: Channel) {
    if (!confirm(`删除渠道 "${ch.label}"？`)) return;
    const res = await fetch(`/api/v1/manage/channels?vendor=${ch.vendor}&id=${ch.id}`, { method: 'DELETE' });
    if (!res.ok) { setError('Failed to delete channel'); return; }
    await load();
  }

  function handleEdit(ch: Channel) {
    setEditId(ch.id);
    setEditForm({ label: ch.label, apiKey: '', weight: String(ch.weight) });
  }

  async function handleEditSave(ch: Channel) {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { vendor: ch.vendor, id: ch.id };
      if (editForm.label) patch.label = editForm.label;
      if (editForm.apiKey) patch.apiKey = editForm.apiKey;
      patch.weight = Number(editForm.weight) || 1;
      const res = await fetch('/api/v1/manage/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) { setError('Failed to save changes'); return; }
      setEditId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleResetCircuit(ch: Channel) {
    await fetch('/api/v1/manage/channels/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', id: ch.id }),
    });
    await load();
  }

  async function handleProbe(ch: Channel) {
    setProbingId(ch.id);
    try {
      await fetch('/api/v1/manage/channels/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'probe', id: ch.id }),
      });
      await load();
    } finally {
      setProbingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight">渠道管理</h1>
            <p className="text-[13px] text-[var(--text-2)] mt-0.5">
              管理上游 API Key · 熔断阈值 3 次连续失败 · 5 分钟冷却后自动探活
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm text-[var(--text-2)] hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw size={13} />
              刷新
            </button>
            <button
              onClick={() => { setShowAdd(true); setForm(f => ({ ...f, vendor: activeVendor })); }}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
            >
              <Plus size={14} strokeWidth={2.5} />
              添加渠道
            </button>
          </div>
        </div>

        {/* Vendor tabs */}
        <div className="flex gap-1.5 mb-6">
          {VENDORS.map(v => {
            const vChannels = channels.filter(c => c.vendor === v);
            const broken = vChannels.filter(c => c.health.circuitOpen).length;
            return (
              <button
                key={v}
                onClick={() => setActiveVendor(v)}
                className={`px-4 py-2 rounded-[var(--radius-md)] text-[13px] font-medium border transition-all flex items-center gap-2 ${
                  activeVendor === v
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-transparent'
                    : 'border-[var(--border)] text-[var(--text-2)] bg-[var(--surface)] hover:border-[var(--border-hover)]'
                }`}
              >
                {VENDOR_CONFIG[v].label}
                <span className={`text-[10px] font-mono ${activeVendor === v ? 'text-white/50' : 'text-[var(--text-4)]'}`}>
                  {vChannels.length}
                </span>
                {broken > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">{broken}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-vault">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">厂商</label>
                <div className="relative mt-1">
                  <select
                    value={form.vendor}
                    onChange={e => setForm(f => ({ ...f, vendor: e.target.value as VendorId }))}
                    className="w-full appearance-none bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm pr-8 focus:outline-none focus:border-[var(--accent)]"
                  >
                    {VENDORS.map(v => <option key={v} value={v}>{VENDOR_CONFIG[v].label}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">渠道名称</label>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Primary Key"
                  className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">API Key</label>
                <input
                  value={form.apiKey}
                  onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  placeholder="sk-ant-..."
                  type="password"
                  className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-[var(--text-3)] uppercase tracking-wide">权重</label>
                <input
                  value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  type="number" min="1" max="100"
                  className="mt-1 w-full bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            {error && <p className="text-[var(--danger)] text-xs mb-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAdd(false); setError(''); }} className="px-3 py-1.5 text-sm text-[var(--text-2)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)]">取消</button>
              <button onClick={handleAdd} disabled={saving} className="px-4 py-1.5 text-sm bg-[var(--accent)] text-[var(--accent-fg)] font-medium rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                {saving ? '保存中…' : '添加'}
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-vault overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-3)] text-sm">加载中…</div>
          ) : vendorChannels.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-3)] text-sm">
              暂无渠道。代理将回退到环境变量{' '}
              <code className="font-mono text-xs bg-[var(--surface-raised)] px-1.5 py-0.5 rounded">
                {activeVendor.toUpperCase()}_MASTER_KEY
              </code>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">名称 / Key</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">健康</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">最后错误</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">权重</th>
                  <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">启停</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {vendorChannels.map((ch, i) => (
                  <tr
                    key={ch.id}
                    className={`${i > 0 ? 'border-t border-[var(--border)]' : ''} ${ch.health.circuitOpen ? 'bg-red-50/30' : ''}`}
                  >
                    {/* Name + key */}
                    <td className="px-4 py-3">
                      {editId === ch.id ? (
                        <div className="space-y-1.5">
                          <input
                            value={editForm.label}
                            onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                            placeholder="名称"
                            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
                          />
                          <input
                            value={editForm.apiKey}
                            onChange={e => setEditForm(f => ({ ...f, apiKey: e.target.value }))}
                            placeholder="新 Key（留空保持原来）"
                            type="password"
                            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{ch.label}</div>
                          <code className="text-[11px] text-[var(--text-4)] font-mono">{ch.apiKey}</code>
                        </div>
                      )}
                    </td>

                    {/* Health */}
                    <td className="px-4 py-3 text-center">
                      <HealthBadge health={ch.health} />
                    </td>

                    {/* Last error */}
                    <td className="px-4 py-3 text-center">
                      {ch.health.lastError ? (
                        <div className="text-[11px]">
                          <span className="text-red-500 font-medium">{ch.health.lastError}</span>
                          <div className="text-[var(--text-4)]">{fmtTime(ch.health.lastErrorAt)}</div>
                        </div>
                      ) : (
                        <span className="text-[var(--text-4)] text-[11px]">—</span>
                      )}
                    </td>

                    {/* Weight */}
                    <td className="px-4 py-3 text-center">
                      {editId === ch.id ? (
                        <input
                          value={editForm.weight}
                          onChange={e => setEditForm(f => ({ ...f, weight: e.target.value }))}
                          type="number" min="1"
                          className="w-14 text-center bg-[var(--bg)] border border-[var(--border)] rounded px-1 py-1 text-sm focus:outline-none focus:border-[var(--accent)]"
                        />
                      ) : (
                        <span className="font-mono text-[var(--text-2)]">{ch.weight}</span>
                      )}
                    </td>

                    {/* Toggle */}
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggle(ch)} title={ch.enabled ? '点击禁用' : '点击启用'}>
                        {ch.enabled
                          ? <ToggleRight size={20} className="text-[var(--success)] mx-auto" />
                          : <ToggleLeft size={20} className="text-[var(--text-3)] mx-auto" />
                        }
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {editId === ch.id ? (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => handleEditSave(ch)} disabled={saving} className="p-1.5 rounded hover:bg-green-50 text-green-600"><Check size={14} /></button>
                          <button onClick={() => setEditId(null)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-3)]"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          {/* Probe button */}
                          <button
                            onClick={() => handleProbe(ch)}
                            disabled={probingId === ch.id}
                            title="发送探活请求"
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-500 disabled:opacity-40"
                          >
                            <Activity size={14} className={probingId === ch.id ? 'animate-pulse' : ''} />
                          </button>
                          {/* Reset circuit — only show when circuit is open */}
                          {ch.health.circuitOpen && (
                            <button
                              onClick={() => handleResetCircuit(ch)}
                              title="重置熔断器"
                              className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          <button onClick={() => handleEdit(ch)} className="p-1.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-3)]"><Pencil size={14} /></button>
                          <button onClick={() => handleDelete(ch)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500">{error}</p>
        )}

        <div className="mt-4 flex flex-col gap-1 text-[11px] text-[var(--text-4)]">
          <p>• 代理优先级：启用 + 健康渠道（按权重加权随机）→ 熔断渠道冷却后探活 → 环境变量</p>
          <p>• 连续失败 3 次自动熔断，5 分钟后允许一次探活请求，成功则自动恢复</p>
          <p>• 点击 <Activity size={11} className="inline" /> 主动探活；点击 <RefreshCw size={11} className="inline" /> 手动重置熔断器</p>
        </div>
      </div>
    </div>
  );
}
