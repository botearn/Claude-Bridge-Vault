'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { VENDOR_CONFIG } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';

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
  const config = VENDOR_CONFIG[vendor];
  const baseUrl = (typeof window !== 'undefined' ? window.location.origin : '') + config.basePath;

  const snippets: Record<string, string> = {
    claude: `curl ${baseUrl} \\\n  -H "x-api-key: ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -d '{"model":"claude-opus-4-6","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'`,
    openai: `curl ${baseUrl} \\\n  -H "Authorization: Bearer ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`,
    gemini: `curl ${baseUrl} \\\n  -H "x-api-key: ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gemini-pro","contents":[{"parts":[{"text":"Hello"}]}]}'`,
    youragent: `curl ${baseUrl} \\\n  -H "x-api-key: ${subKey}" \\\n  -H "Content-Type: application/json" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -d '{"model":"claude-opus-4-6","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'`,
  };
  const snippet = snippets[vendor] ?? snippets.claude;

  return (
    <div className="space-y-3 text-sm">
      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">Base URL</div>
            <code className="font-mono text-xs text-black">{baseUrl}</code>
          </div>
          <CopyButton text={baseUrl} />
        </div>
      </div>

      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">API Key</div>
            <code className="font-mono text-xs text-black">{subKey}</code>
          </div>
          <CopyButton text={subKey} />
        </div>
      </div>

      <div className="p-3 border border-black/10 rounded-xl bg-black/[0.02]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold text-black/40 uppercase tracking-widest mb-1">Auth Header</div>
            <code className="font-mono text-xs text-black">{config.authStyle}</code>
          </div>
          <CopyButton text={snippet} />
        </div>
        <div className="text-[10px] text-black/40 mt-1">Copy Snippet copies full curl command</div>
      </div>
    </div>
  );
}
