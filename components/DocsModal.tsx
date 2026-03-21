'use client';

import React, { useEffect } from 'react';
import { X, BookOpen, ExternalLink } from 'lucide-react';
import { useLang } from './LangContext';

interface DocsModalProps {
  onClose: () => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="text-xs font-semibold uppercase tracking-widest text-black/30 mb-3">{title}</h2>
    <div className="space-y-4">{children}</div>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 bg-black/5 rounded font-mono text-[12px]">{children}</code>
);

const Block = ({ children }: { children: string }) => (
  <pre className="bg-black/[0.04] border border-black/8 rounded-xl px-4 py-3 font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre">
    {children}
  </pre>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-black/60 leading-relaxed text-[13px]">{children}</p>
);

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-50 text-blue-600',
    POST: 'bg-green-50 text-green-600',
    PATCH: 'bg-amber-50 text-amber-600',
    DELETE: 'bg-red-50 text-red-500',
  };
  return (
    <span className={`mt-px shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${colors[method] ?? 'bg-gray-50 text-gray-600'}`}>
      {method}
    </span>
  );
}

export function DocsModal({ onClose }: DocsModalProps) {
  const { t } = useLang();
  const d = t.docs;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/8">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-black/50" />
            <span className="font-semibold text-sm">{d.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/docs"
              className="flex items-center gap-1 text-xs text-black/40 hover:text-black transition-colors"
            >
              Full docs <ExternalLink size={10} />
            </a>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            >
              <X size={15} className="text-black/50" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-6 flex-1 text-sm text-[var(--text)]">

          <Section title={d.overview}>
            <P>{d.overviewText}</P>
          </Section>

          <Section title={d.proxyEndpoints}>
            <P>{d.proxyDesc}</P>
            <div className="overflow-hidden rounded-xl border border-black/8">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-black/[0.03] border-b border-black/8">
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.vendor}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.path}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.format}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 font-mono">
                  <tr><td className="px-4 py-2.5">Claude</td><td className="px-4 py-2.5 text-black/60">/api/v1/claude</td><td className="px-4 py-2.5 text-black/60">Anthropic (x-api-key)</td></tr>
                  <tr><td className="px-4 py-2.5">YourAgent</td><td className="px-4 py-2.5 text-black/60">/api/v1/youragent</td><td className="px-4 py-2.5 text-black/60">Anthropic (x-api-key)</td></tr>
                  <tr><td className="px-4 py-2.5">Yunwu</td><td className="px-4 py-2.5 text-black/60">/api/v1/yunwu</td><td className="px-4 py-2.5 text-black/60">OpenAI (Bearer)</td></tr>
                </tbody>
              </table>
            </div>
            <P>Claude/YourAgent authenticate via <Code>x-api-key</Code> header. Yunwu uses <Code>Bearer</Code> token.</P>
          </Section>

          <Section title={d.examples}>
            <P>{d.exampleClaude}</P>
            <Block>{`curl https://sitesfy.run/api/v1/claude \\
  -H "x-api-key: sk-vault-claude-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'`}</Block>

            <P>{d.exampleYunwu}</P>
            <Block>{`curl https://sitesfy.run/api/v1/yunwu \\
  -H "x-api-key: sk-vault-yunwu-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`}</Block>

          </Section>

          <Section title={d.keyManagement}>
            <P>{d.keyManagementDesc}</P>
            <div className="space-y-3">
              {[...d.endpoints, ...d.groupEndpoints, ...d.otherEndpoints].map(({ method, path, desc }) => (
                <div key={path + method} className="flex items-start gap-3">
                  <MethodBadge method={method} />
                  <div>
                    <Code>{path}</Code>
                    <span className="ml-2 text-black/50 text-[12.5px]">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={d.rateLimiting}>
            <P>{d.rateLimitDesc}</P>
          </Section>

          <Section title={d.quotaExpiry}>
            <ul className="text-black/60 leading-loose text-[13px] list-disc list-inside space-y-1">
              {d.quotaBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </Section>

          <Section title={d.masterKeyRotation}>
            <P>{d.masterKeyDesc}</P>
            <Block>{`CLAUDE_MASTER_KEY=sk-ant-key1,sk-ant-key2,sk-ant-key3`}</Block>
          </Section>

          <Section title={d.webhook}>
            <P>{d.webhookDesc}</P>
            <Block>{`WEBHOOK_URL=https://hooks.example.com/xxx
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx`}</Block>
          </Section>

          <Section title={d.errorCodes}>
            <div className="overflow-hidden rounded-xl border border-black/8">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-black/[0.03] border-b border-black/8">
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 text-[12.5px]">
                  <tr><td className="px-4 py-2 font-mono">401</td><td className="px-4 py-2 text-black/60">Missing API Key</td></tr>
                  <tr><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2 text-black/60">Invalid key / Key expired</td></tr>
                  <tr><td className="px-4 py-2 font-mono">429</td><td className="px-4 py-2 text-black/60">Rate limit / Quota exceeded</td></tr>
                  <tr><td className="px-4 py-2 font-mono">500</td><td className="px-4 py-2 text-black/60">Service misconfigured</td></tr>
                  <tr><td className="px-4 py-2 font-mono">502</td><td className="px-4 py-2 text-black/60">All upstream keys failed</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={d.keyFormat}>
            <P>{d.keyFormatDesc}</P>
            <Block>{`sk-vault-{vendor}-{random8chars}
sk-vault-claude-a1b2c3d4
sk-vault-yunwu-z9y8x7w6`}</Block>
          </Section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/8 flex justify-between items-center">
          <a
            href="/docs"
            className="text-xs text-black/40 hover:text-black transition-colors flex items-center gap-1"
          >
            Full documentation <ExternalLink size={10} />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-black/80 transition-colors"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
