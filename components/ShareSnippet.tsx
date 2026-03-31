'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';
import { useLang } from './LangContext';

interface ShareSnippetProps {
  subKey: string;
  vendor: VendorId;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 border border-black/10 rounded-md hover:bg-black hover:text-white transition-colors flex-shrink-0"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function ShareSnippet({ subKey, vendor }: ShareSnippetProps) {
  const { t } = useLang();
  const [copiedAll, setCopiedAll] = useState(false);
  const config = VENDOR_CONFIG[vendor];
  const baseUrl = (typeof window !== 'undefined' ? window.location.origin : '') + config.basePath;

  const handleCopyAll = () => {
    const text = `Base URL: ${baseUrl}\nAPI Key: ${subKey}\nAuth Header: ${config.authStyle}`;
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const snippets: Record<string, string> = {
    claude: `curl ${baseUrl} \\\n  -H "x-api-key: ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -d '{"model":"claude-opus-4-6","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'`,
    yunwu: `curl ${baseUrl} \\\n  -H "x-api-key: ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`,
  };
  const snippet = snippets[vendor] ?? snippets.claude;

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">
              {t.shareSnippet.baseUrl}
            </div>
            <code className="font-mono text-xs text-black">{baseUrl}</code>
          </div>
          <CopyButton text={baseUrl} />
        </div>
      </div>

      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">
              {t.shareSnippet.apiKey}
            </div>
            <code className="font-mono text-xs text-black">{subKey}</code>
          </div>
          <CopyButton text={subKey} />
        </div>
      </div>

      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">
              {t.shareSnippet.authHeader}
            </div>
            <code className="font-mono text-xs text-black">{config.authStyle}</code>
          </div>
          <CopyButton text={config.authStyle} />
        </div>
        <div className="text-[10px] text-black/40 mt-1">{t.shareSnippet.copyHint}</div>
      </div>

      <button
        onClick={handleCopyAll}
        className="w-full flex items-center justify-center gap-2 py-2 border border-black/15 rounded-xl text-xs font-semibold hover:bg-black hover:text-white hover:border-black transition-colors"
      >
        {copiedAll ? <Check size={12} /> : <Copy size={12} />}
        {copiedAll ? t.createKeyModal.copied : t.shareSnippet.copyAll}
      </button>
    </div>
  );
}
