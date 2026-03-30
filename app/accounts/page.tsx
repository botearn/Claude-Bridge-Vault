'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Check, X, Eye, EyeOff, ExternalLink, Copy, Search, Lock, ShieldCheck } from 'lucide-react';
import { useLang } from '@/components/LangContext';

const STORAGE_KEY = 'vault:accounts_unlocked';

interface Account {
  id: string;
  vendorName: string;
  apiEndpoint: string;
  websiteUrl: string;
  username: string;
  password: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  vendorName: '',
  apiEndpoint: '',
  websiteUrl: '',
  username: '',
  password: '',
  notes: '',
};

export default function AccountsPage() {
  const { t } = useLang();
  const a = t.accounts;

  const [unlocked, setUnlocked] = useState(false);
  const [pagePassword, setPagePassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') setUnlocked(true);
  }, []);

  const handleUnlock = async () => {
    if (!pagePassword) return;
    setVerifying(true);
    setPwdError('');
    try {
      const res = await fetch('/api/v1/manage/accounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pagePassword }),
      });
      if (res.ok) {
        sessionStorage.setItem(STORAGE_KEY, '1');
        setUnlocked(true);
      } else {
        setPwdError(a.wrongPassword);
      }
    } catch {
      setPwdError('Network error');
    } finally {
      setVerifying(false);
    }
  };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [visiblePwd, setVisiblePwd] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/manage/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.vendorName.trim()) return;
    setSaving(true);
    try {
      const url = '/api/v1/manage/accounts';
      const method = editingId ? 'PATCH' : 'POST';
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (acc: Account) => {
    setEditingId(acc.id);
    setForm({
      vendorName: acc.vendorName,
      apiEndpoint: acc.apiEndpoint,
      websiteUrl: acc.websiteUrl,
      username: acc.username,
      password: acc.password,
      notes: acc.notes,
    });
    setShowForm(true);
  };

  const handleDelete = async (acc: Account) => {
    if (!confirm(a.deleteConfirm(acc.vendorName))) return;
    await fetch('/api/v1/manage/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: acc.id }),
    });
    load();
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const togglePwd = (id: string) => {
    setVisiblePwd(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filtered = accounts.filter(acc => {
    if (!search) return true;
    const q = search.toLowerCase();
    return acc.vendorName.toLowerCase().includes(q)
      || acc.apiEndpoint.toLowerCase().includes(q)
      || acc.username.toLowerCase().includes(q)
      || acc.notes.toLowerCase().includes(q);
  });

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] font-sans text-[#111] selection:bg-black/10 flex items-center justify-center">
        <div className="bg-white border border-black/10 rounded-2xl shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center mx-auto mb-4">
            <Lock size={20} className="text-white" />
          </div>
          <h2 className="text-lg font-bold mb-1">{a.title}</h2>
          <p className="text-sm text-black/40 mb-5">{a.passwordRequired}</p>
          <form onSubmit={e => { e.preventDefault(); handleUnlock(); }}>
            <input
              type="password"
              value={pagePassword}
              onChange={e => { setPagePassword(e.target.value); setPwdError(''); }}
              placeholder={a.enterPassword}
              autoFocus
              className="w-full px-4 py-2.5 border border-black/10 rounded-xl text-sm outline-none focus:border-black/30 transition-colors mb-3"
            />
            {pwdError && <p className="text-xs text-red-500 mb-3">{pwdError}</p>}
            <button
              type="submit"
              disabled={verifying || !pagePassword}
              className="w-full py-2.5 bg-black text-white text-sm font-medium rounded-xl hover:bg-black/80 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {verifying ? (
                t.common.loading
              ) : (
                <><ShieldCheck size={16} /> {a.unlock}</>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7] font-sans text-[#111] selection:bg-black/10">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{a.title}</h1>
              <p className="text-sm text-black/40">{a.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-black/80 transition-colors"
          >
            <Plus size={16} />
            {a.addAccount}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={a.searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-black/10 rounded-xl text-sm outline-none focus:border-black/30 transition-colors"
          />
        </div>

        {/* Form modal overlay */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
              <h2 className="text-lg font-bold mb-4">
                {editingId ? a.editAccount : a.addAccount}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-black/50 mb-1 block">{a.vendorName} *</label>
                  <input
                    value={form.vendorName}
                    onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                    placeholder={a.vendorNamePlaceholder}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 mb-1 block">{a.apiEndpoint}</label>
                  <input
                    value={form.apiEndpoint}
                    onChange={e => setForm(f => ({ ...f, apiEndpoint: e.target.value }))}
                    placeholder={a.apiEndpointPlaceholder}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 mb-1 block">{a.websiteUrl}</label>
                  <input
                    value={form.websiteUrl}
                    onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                    placeholder={a.websiteUrlPlaceholder}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-black/50 mb-1 block">{a.username}</label>
                    <input
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                      placeholder={a.usernamePlaceholder}
                      className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-black/50 mb-1 block">{a.password}</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={a.passwordPlaceholder}
                      className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-black/50 mb-1 block">{a.notes}</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder={a.notesPlaceholder}
                    rows={2}
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-sm outline-none focus:border-black/30 resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
                  className="px-4 py-2 text-sm text-black/50 hover:text-black transition-colors"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.vendorName.trim()}
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-black/80 transition-colors disabled:opacity-40"
                >
                  {saving ? t.common.saving : t.common.save}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Account cards */}
        {loading ? (
          <div className="text-center py-20 text-black/30 text-sm">{t.common.loading}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={40} className="mx-auto text-black/10 mb-3" />
            <p className="text-black/30 text-sm">{search ? a.noResults : a.noAccounts}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(acc => (
              <div
                key={acc.id}
                className="bg-white border border-black/10 rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold">{acc.vendorName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(acc)}
                      className="p-1.5 rounded-lg text-black/30 hover:text-black hover:bg-black/5 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(acc)}
                      className="p-1.5 rounded-lg text-black/30 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {acc.websiteUrl && (
                    <div className="flex items-center gap-2">
                      <span className="text-black/40 w-20 shrink-0">{a.websiteUrl}</span>
                      <a
                        href={acc.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate max-w-[220px]"
                      >
                        {acc.websiteUrl.replace(/^https?:\/\//, '')}
                      </a>
                      <a
                        href={acc.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        onClick={() => handleCopy(acc.websiteUrl, `web-${acc.id}`)}
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        {copied === `web-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}

                  {acc.apiEndpoint && (
                    <div className="flex items-center gap-2">
                      <span className="text-black/40 w-20 shrink-0">{a.apiEndpoint}</span>
                      <code className="text-xs bg-black/5 px-2 py-0.5 rounded font-mono truncate max-w-[220px]">
                        {acc.apiEndpoint}
                      </code>
                      <button
                        onClick={() => handleCopy(acc.apiEndpoint, `api-${acc.id}`)}
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        {copied === `api-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}

                  {acc.username && (
                    <div className="flex items-center gap-2">
                      <span className="text-black/40 w-20 shrink-0">{a.username}</span>
                      <span className="truncate max-w-[200px]">{acc.username}</span>
                      <button
                        onClick={() => handleCopy(acc.username, `user-${acc.id}`)}
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        {copied === `user-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}

                  {acc.password && (
                    <div className="flex items-center gap-2">
                      <span className="text-black/40 w-20 shrink-0">{a.password}</span>
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {visiblePwd[acc.id] ? acc.password : '••••••••'}
                      </span>
                      <button
                        onClick={() => togglePwd(acc.id)}
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        {visiblePwd[acc.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={() => handleCopy(acc.password, `pwd-${acc.id}`)}
                        className="text-black/20 hover:text-black shrink-0"
                      >
                        {copied === `pwd-${acc.id}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}
                </div>

                {acc.notes && (
                  <p className="mt-3 text-xs text-black/40 leading-relaxed">{acc.notes}</p>
                )}

                <div className="mt-3 text-[11px] text-black/20">
                  {a.created} {new Date(acc.createdAt).toLocaleDateString()}
                  {acc.updatedAt !== acc.createdAt && (
                    <> · {a.updated} {new Date(acc.updatedAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
