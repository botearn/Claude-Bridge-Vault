'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { VENDOR_MODELS } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';
import { ShareSnippet } from './ShareSnippet';
import { emitVaultSync } from '@/lib/vaultSync';

// All models come from yunwu (broadest coverage: Claude, OpenAI, Google, etc.)
const ALL_MODELS = VENDOR_MODELS.yunwu;

// Derive vendor from model — claude models go through youragent (cheaper), rest via yunwu
function modelToVendor(model: string): VendorId {
  if (model.startsWith('claude-')) return 'youragent';
  return 'yunwu';
}

interface CreateKeyModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateKeyModal({ onClose, onCreated }: CreateKeyModalProps) {
  const [model, setModel] = useState(ALL_MODELS[0]?.value ?? '');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Group models by provider for the select dropdown
  const grouped = ALL_MODELS.reduce<Record<string, typeof ALL_MODELS>>((acc, m) => {
    const g = m.group ?? 'Other';
    (acc[g] ??= []).push(m);
    return acc;
  }, {});

  const handleSubmit = async () => {
    if (!name.trim() || !model) return;
    setLoading(true);
    setError('');
    const vendor = modelToVendor(model);
    try {
      const res = await fetch('/api/v1/manage/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          vendor,
          group: 'my-keys',
          scope: 'external',
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create key');
        return;
      }
      setCreatedKey(data.subKey);
      emitVaultSync({ source: 'create-key', vendor, group: 'my-keys' });
      onCreated();
    } catch {
      setError('Network error, please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50">
      <div className="bg-white text-black border border-black/10 rounded-2xl w-full max-w-md p-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Create API Key</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black transition-colors">
            <X size={20} />
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <p className="text-sm text-black/60">
              Key created! Copy it now — it won&apos;t be shown again.
            </p>
            <div className="font-mono text-xs bg-black/5 rounded-lg p-3 break-all select-all">
              {createdKey}
            </div>
            <button
              onClick={handleCopy}
              className="w-full py-2.5 border border-black rounded-lg text-sm font-semibold hover:bg-black hover:text-white transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy Key'}
            </button>
            <ShareSnippet subKey={createdKey} vendor={modelToVendor(model)} />
            <button
              onClick={onClose}
              className="w-full py-2.5 border border-black/15 rounded-lg text-sm text-black/60 hover:bg-black/5 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Model — primary required field */}
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-2">
                Model <span className="text-red-400">*</span>
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-black/40 bg-white"
              >
                {Object.entries(grouped).map(([groupName, groupModels]) => (
                  <optgroup key={groupName} label={groupName}>
                    {groupModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[10px] text-black/35 mt-1.5">
                This key will only work with the selected model.
              </p>
            </div>

            {/* Key Name */}
            <div>
              <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest block mb-2">
                Key Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. My chatbot, Project X"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full border border-black/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-black/40"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading || !name.trim() || !model}
              className="w-full py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-black/80 transition-colors disabled:opacity-40"
            >
              {loading ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
