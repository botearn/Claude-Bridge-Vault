'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';

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

export default function DocsPage() {
  const { t } = useLang();
  const d = t.docs;

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-[#111] font-sans selection:bg-black/10">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="flex items-center justify-between mb-10 border-b border-black/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                {d.title}
              </h1>
              <p className="text-sm text-black/60">{d.overviewText}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <a href="/vault" className="text-xs text-black/40 hover:text-black transition-colors">{d.back}</a>
          </div>
        </header>

        <div className="bg-white border border-black/10 rounded-2xl p-6 shadow-sm shadow-black/5">
          <Section title={d.overview}>
            <p className="text-black/60 leading-relaxed">{d.overviewText}</p>
          </Section>

          <Section title={d.proxyEndpoints}>
            <p className="text-black/50 text-[13px] mb-2">{d.proxyDesc}</p>
            <div className="overflow-hidden rounded-xl border border-black/8">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-black/[0.03] border-b border-black/8">
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.vendor}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.path}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-black/40">{d.auth}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 font-mono">
                  <tr>
                    <td className="px-4 py-2.5">YourAgent</td>
                    <td className="px-4 py-2.5 text-black/60">/api/v1/youragent</td>
                    <td className="px-4 py-2.5 text-black/60">x-api-key</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Claude</td>
                    <td className="px-4 py-2.5 text-black/60">/api/v1/claude</td>
                    <td className="px-4 py-2.5 text-black/60">x-api-key</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">OpenAI</td>
                    <td className="px-4 py-2.5 text-black/60">/api/v1/openai</td>
                    <td className="px-4 py-2.5 text-black/60">Bearer token</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Gemini</td>
                    <td className="px-4 py-2.5 text-black/60">/api/v1/gemini</td>
                    <td className="px-4 py-2.5 text-black/60">?key=</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={d.examples}>
            <p className="text-black/50 text-[13px]">{d.examplesDesc}</p>
            <Block>{`curl https://your-domain.com/api/v1/claude \\
  -H "x-api-key: sk-vault-claude-xxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-6",
    "max_tokens": 1024,
    "messages": [{"role":"user","content":"Hello"}]
  }'`}</Block>
            <p className="text-black/50 text-[13px]">{d.examplesOpenAI}</p>
            <Block>{`curl https://your-domain.com/api/v1/openai \\
  -H "Authorization: Bearer sk-vault-openai-xxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}]}'`}</Block>
          </Section>

          <Section title={d.keyManagement}>
            <div className="space-y-3">
              {d.endpoints.map(({ method, path, desc }) => (
                <div key={path + method} className="flex items-start gap-3">
                  <span className={`mt-px shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                    method === 'GET' ? 'bg-blue-50 text-blue-600' :
                    method === 'POST' ? 'bg-green-50 text-green-600' :
                    method === 'PATCH' ? 'bg-amber-50 text-amber-600' :
                    'bg-red-50 text-red-500'
                  }`}>{method}</span>
                  <div>
                    <Code>{path}</Code>
                    <span className="ml-2 text-black/50 text-[12.5px]">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={d.quotaExpiry}>
            <ul className="text-black/60 leading-loose text-[13px] list-disc list-inside space-y-1">
              {d.quotaBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </Section>

          <Section title={d.keyFormat}>
            <p className="text-black/50 text-[13px]">{d.keyFormatDesc}</p>
            <Block>{`sk-vault-{vendor}-{random16chars}

sk-vault-claude-a1b2c3d4e5f6g7h8
sk-vault-openai-z9y8x7w6v5u4t3s2`}</Block>
          </Section>
        </div>
      </div>
    </div>
  );
}
