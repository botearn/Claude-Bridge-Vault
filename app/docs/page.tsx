'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BookOpen } from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';

/* ── Shared components ── */

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-10 scroll-mt-24">
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-3)] mb-3">{title}</h2>
    <div className="space-y-4">{children}</div>
  </section>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-[var(--radius-sm)] font-mono text-[12px]">{children}</code>
);

const Block = ({ children }: { children: string }) => (
  <pre className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-[var(--radius-md)] px-4 py-3 font-mono text-[12px] leading-relaxed overflow-x-auto whitespace-pre">
    {children}
  </pre>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[var(--text-2)] leading-relaxed text-[13px]">{children}</p>
);

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-50 text-blue-600',
    POST: 'bg-green-50 text-green-600',
    PATCH: 'bg-amber-50 text-amber-600',
    DELETE: 'bg-red-50 text-red-500',
  };
  return (
    <span className={`mt-px shrink-0 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-mono font-semibold ${colors[method] ?? 'bg-gray-50 text-gray-600'}`}>
      {method}
    </span>
  );
}

function EndpointList({ items }: { items: { method: string; path: string; desc: string }[] }) {
  return (
    <div className="space-y-3">
      {items.map(({ method, path, desc }) => (
        <div key={path + method} className="flex items-start gap-3">
          <MethodBadge method={method} />
          <div>
            <Code>{path}</Code>
            <span className="ml-2 text-[var(--text-3)] text-[12.5px]">{desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--surface-raised)] border-b border-[var(--border)]">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-medium text-[var(--text-3)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] font-mono">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--surface-hover)] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 ${j > 0 ? 'text-[var(--text-2)]' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Table of Contents ── */

interface TocItem {
  id: string;
  label: string;
  num: string;
}

function TableOfContents({ items, activeId }: { items: TocItem[]; activeId: string }) {
  return (
    <nav className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-4)] mb-3">Contents</div>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`group flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-[var(--radius-sm)] text-[12px] transition-all duration-[var(--duration-normal)] ease-out-expo ${
            activeId === item.id
              ? 'bg-[var(--accent)] text-[var(--accent-fg)] font-medium'
              : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <span className={`font-mono text-[10px] tabular-nums w-4 text-right flex-shrink-0 ${
            activeId === item.id ? 'text-white/50' : 'text-[var(--text-4)]'
          }`}>
            {item.num}
          </span>
          <span className="truncate">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

/* ── Main Page ── */

export default function DocsPage() {
  const { t } = useLang();
  const d = t.docs;
  const [activeId, setActiveId] = useState('overview');
  const observerRef = useRef<IntersectionObserver | null>(null);

  const tocItems: TocItem[] = [
    { id: 'overview', label: d.overview, num: '1' },
    { id: 'proxy-endpoints', label: d.proxyEndpoints, num: '2' },
    { id: 'usage-examples', label: d.examples, num: '3' },
    { id: 'key-management', label: d.keyManagement, num: '4' },
    { id: 'group-management', label: d.groupManagement, num: '5' },
    { id: 'analytics-settings', label: 'Analytics & Settings', num: '6' },
    { id: 'rate-limiting', label: d.rateLimiting, num: '7' },
    { id: 'quota-expiry', label: d.quotaExpiry, num: '8' },
    { id: 'token-tracking', label: d.tokenTracking, num: '9' },
    { id: 'master-key-rotation', label: d.masterKeyRotation, num: '10' },
    { id: 'webhook', label: d.webhook, num: '11' },
    { id: 'error-codes', label: d.errorCodes, num: '12' },
    { id: 'key-format', label: d.keyFormat, num: '13' },
  ];

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    const sections = document.querySelectorAll('section[id]');
    sections.forEach((s) => observerRef.current?.observe(s));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/vault" className="focus-ring flex items-center gap-1.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors mr-2">
              <span className="text-[15px]">&larr;</span>
              <span className="hidden sm:inline">{d.back.replace('← ', '')}</span>
            </a>
            <div className="w-px h-5 bg-[var(--border)]" />
            <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent)] flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight">{d.title}</h1>
              <p className="text-[11px] text-[var(--text-3)] font-mono">Token Bank v0.2</p>
            </div>
          </div>
          <LangToggle />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24">
            <TableOfContents items={tocItems} activeId={activeId} />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] p-8 shadow-vault">

            {/* ── 1. Overview ── */}
            <Section id="overview" title={d.overview}>
              <P>{d.overviewText}</P>
            </Section>

            {/* ── 2. Proxy Endpoints ── */}
            <Section id="proxy-endpoints" title={d.proxyEndpoints}>
              <P>{d.proxyDesc}</P>
              <Table
                headers={[d.vendor, d.path, d.auth, d.format]}
                rows={[
                  ['Claude', '/api/v1/claude', 'x-api-key', 'Anthropic Messages'],
                  ['YourAgent', '/api/v1/youragent', 'x-api-key', 'Anthropic Messages'],
                  ['Yunwu', '/api/v1/yunwu', 'x-api-key', 'OpenAI Chat Completions'],
                ]}
              />
            </Section>

            {/* ── 3. Usage Examples ── */}
            <Section id="usage-examples" title={d.examples}>
              <P>{d.exampleClaude}</P>
              <Block>{`curl https://sitesfy.run/api/v1/claude \\
  -H "x-api-key: sk-vault-claude-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role":"user","content":"Hello"}]
  }'`}</Block>

              <P>{d.exampleYunwu}</P>
              <Block>{`curl https://sitesfy.run/api/v1/yunwu \\
  -H "x-api-key: sk-vault-yunwu-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role":"user","content":"Hello"}]
  }'`}</Block>

              <P>{d.exampleStream}</P>
              <Block>{`curl https://sitesfy.run/api/v1/claude \\
  -H "x-api-key: sk-vault-claude-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role":"user","content":"Hello"}]
  }'

# Returns SSE stream. Token usage is parsed in the background
# and automatically added to the key's usage statistics.`}</Block>
            </Section>

            {/* ── 4. Key Management API ── */}
            <Section id="key-management" title={d.keyManagement}>
              <P>{d.keyManagementDesc}</P>
              <EndpointList items={d.endpoints} />

              <div className="mt-4 p-4 bg-[var(--surface-raised)] rounded-[var(--radius-md)] border border-[var(--border)]">
                <div className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-widest mb-2">{d.pagination}</div>
                <P>{d.paginationDesc}</P>
                <Block>{`GET /api/v1/manage/keys?limit=50&cursor=sk-vault-claude-xxx

# Without limit: returns { "sk-vault-...": {...}, ... }
# With limit:    returns { "keys": {...}, "nextCursor": "...", "total": 123 }`}</Block>
              </div>
            </Section>

            {/* ── 6. Group Management ── */}
            <Section id="group-management" title={d.groupManagement}>
              <EndpointList items={d.groupEndpoints} />
            </Section>

            {/* ── 7. Other Management Endpoints ── */}
            <Section id="analytics-settings" title="Analytics & Settings API">
              <EndpointList items={d.otherEndpoints} />
            </Section>

            {/* ── 8. Rate Limiting ── */}
            <Section id="rate-limiting" title={d.rateLimiting}>
              <P>{d.rateLimitDesc}</P>
              <Block>{`HTTP/1.1 429 Too Many Requests
Retry-After: 45
Content-Type: application/json

{ "error": "Rate limit exceeded", "retryAfter": 45 }`}</Block>
            </Section>

            {/* ── 9. Quota & Expiry ── */}
            <Section id="quota-expiry" title={d.quotaExpiry}>
              <ul className="text-[var(--text-2)] leading-loose text-[13px] list-disc list-inside space-y-1">
                {d.quotaBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Section>

            {/* ── 10. Token Tracking ── */}
            <Section id="token-tracking" title={d.tokenTracking}>
              <P>{d.tokenTrackingDesc}</P>
              <Table
                headers={['Vendor', 'Input Tokens', 'Output Tokens']}
                rows={[
                  ['Claude / YourAgent', 'usage.input_tokens', 'usage.output_tokens'],
                  ['Yunwu (OpenAI)', 'usage.prompt_tokens', 'usage.completion_tokens'],
                ]}
              />
              <div className="mt-3">
                <P>Supported pricing models:</P>
              </div>
              <Table
                headers={['Vendor', 'Models', 'Pricing Source']}
                rows={[
                  ['Claude', 'Opus 4, Sonnet 4, Haiku 4.5, 3.5 series', 'Anthropic official'],
                  ['YourAgent', 'Same as Claude', 'Claude price x 4%'],
                  ['Yunwu', 'GPT-4o, o1, o3, o4-mini, etc.', 'OpenAI official'],
                ]}
              />
            </Section>

            {/* ── 11. Master Key Rotation ── */}
            <Section id="master-key-rotation" title={d.masterKeyRotation}>
              <P>{d.masterKeyDesc}</P>
              <Block>{`# Environment variable example:
CLAUDE_MASTER_KEY=sk-ant-key1,sk-ant-key2,sk-ant-key3

# Token Bank will:
# 1. Round-robin between keys on each request
# 2. On 401/429/5xx, automatically try the next key
# 3. Log which key succeeded: [proxy] claude ✓ succeeded with master-key#1`}</Block>
            </Section>

            {/* ── 12. Webhook ── */}
            <Section id="webhook" title={d.webhook}>
              <P>{d.webhookDesc}</P>
              <Block>{`# Environment variables (both optional):
WEBHOOK_URL=https://hooks.slack.com/services/xxx
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx

# Triggers:
# - quota.exceeded: when a key's token usage reaches totalQuota
# - key.expired: when an expired key is used

# Generic webhook payload:
{
  "event": "quota.exceeded",
  "subKey": "xxxxxxxx",
  "vendor": "claude",
  "group": "team-a",
  "name": "Bot Key 1",
  "detail": "52000/50000 tokens",
  "timestamp": "2026-03-17T10:30:00.000Z"
}`}</Block>
            </Section>

            {/* ── 13. Error Codes ── */}
            <Section id="error-codes" title={d.errorCodes}>
              <Table
                headers={['Status', 'Error', 'Cause']}
                rows={[
                  ['401', 'Missing API Key', 'No x-api-key header'],
                  ['403', 'Invalid or mismatched key', 'Key not found or vendor mismatch'],
                  ['403', 'Key expired', 'expiresAt is in the past'],
                  ['404', 'Unknown vendor', 'Invalid vendor in URL path'],
                  ['429', 'Rate limit exceeded', '> 20 requests per 60s for this key'],
                  ['429', 'Quota exceeded', 'Token usage >= totalQuota'],
                  ['500', 'Service misconfigured', 'Missing master key env var'],
                  ['502', 'All upstream keys failed', 'All master keys returned errors'],
                ]}
              />
            </Section>

            {/* ── 14. Sub-Key Format ── */}
            <Section id="key-format" title={d.keyFormat}>
              <P>{d.keyFormatDesc}</P>
              <Block>{`sk-vault-{vendor}-{random8chars}

sk-vault-claude-a1b2c3d4
sk-vault-youragent-z9y8x7w6
sk-vault-yunwu-m3n4o5p6`}</Block>
            </Section>

          </div>
        </main>
      </div>
    </div>
  );
}
