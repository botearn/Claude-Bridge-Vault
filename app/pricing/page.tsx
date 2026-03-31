'use client';

import React, { useState } from 'react';
import { Tag, ArrowLeft, Wallet } from 'lucide-react';
import { ANTHROPIC_PRICES, OPENAI_COMPAT_PRICES } from '@/lib/billing';
import { StripeCheckoutModal } from '@/components/StripeCheckoutModal';
import { useLang } from '@/components/LangContext';

function fmt(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

interface PricingRow {
  model: string;
  input: number;
  output: number;
  noteKey?: 'extendedThinking' | 'reasoning';
}

export default function PricingPage() {
  const { t } = useLang();
  const p = t.pricing;
  const [showTopUp, setShowTopUp] = useState(false);

  const SECTIONS = [
    {
      label: p.claudeLabel,
      sublabel: p.claudeSublabel,
      accent: 'text-orange-500',
      rows: [
        { model: 'claude-opus-4-6',            ...ANTHROPIC_PRICES['claude-opus-4-6'] },
        { model: 'claude-opus-4-20250514',      ...ANTHROPIC_PRICES['claude-opus-4-20250514'] },
        { model: 'claude-sonnet-4-6',           ...ANTHROPIC_PRICES['claude-sonnet-4-6'] },
        { model: 'claude-sonnet-4-20250514',    ...ANTHROPIC_PRICES['claude-sonnet-4-20250514'] },
        { model: 'claude-haiku-4-5-20251001',   ...ANTHROPIC_PRICES['claude-haiku-4-5-20251001'] },
        { model: 'claude-3-5-haiku-20241022',   ...ANTHROPIC_PRICES['claude-3-5-haiku-20241022'] },
        { model: 'claude-opus-4-6-thinking',    ...ANTHROPIC_PRICES['claude-opus-4-6-thinking'],   noteKey: 'extendedThinking' as const },
        { model: 'claude-sonnet-4-6-thinking',  ...ANTHROPIC_PRICES['claude-sonnet-4-6-thinking'], noteKey: 'extendedThinking' as const },
      ] as PricingRow[],
    },
    {
      label: p.openaiLabel,
      sublabel: p.openaiSublabel,
      accent: 'text-blue-600',
      rows: [
        { model: 'gpt-4.1',       ...OPENAI_COMPAT_PRICES['gpt-4.1'] },
        { model: 'gpt-4.1-mini',  ...OPENAI_COMPAT_PRICES['gpt-4.1-mini'] },
        { model: 'gpt-4.1-nano',  ...OPENAI_COMPAT_PRICES['gpt-4.1-nano'] },
        { model: 'gpt-4o',        ...OPENAI_COMPAT_PRICES['gpt-4o'] },
        { model: 'gpt-4o-mini',   ...OPENAI_COMPAT_PRICES['gpt-4o-mini'] },
        { model: 'o1',            ...OPENAI_COMPAT_PRICES['o1'],      noteKey: 'reasoning' as const },
        { model: 'o1-mini',       ...OPENAI_COMPAT_PRICES['o1-mini'], noteKey: 'reasoning' as const },
        { model: 'o1-pro',        ...OPENAI_COMPAT_PRICES['o1-pro'],  noteKey: 'reasoning' as const },
        { model: 'o3',            ...OPENAI_COMPAT_PRICES['o3'],      noteKey: 'reasoning' as const },
        { model: 'o3-mini',       ...OPENAI_COMPAT_PRICES['o3-mini'], noteKey: 'reasoning' as const },
        { model: 'o4-mini',       ...OPENAI_COMPAT_PRICES['o4-mini'], noteKey: 'reasoning' as const },
      ] as PricingRow[],
    },
    {
      label: p.geminiLabel,
      sublabel: p.geminiSublabel,
      accent: 'text-purple-600',
      rows: [
        { model: 'gemini-2.5-pro',   ...OPENAI_COMPAT_PRICES['gemini-2.5-pro'] },
        { model: 'gemini-2.5-flash', ...OPENAI_COMPAT_PRICES['gemini-2.5-flash'] },
        { model: 'gemini-2.0-flash', ...OPENAI_COMPAT_PRICES['gemini-2.0-flash'] },
      ] as PricingRow[],
    },
    {
      label: p.grokLabel,
      sublabel: p.grokSublabel,
      accent: 'text-zinc-600',
      rows: [
        { model: 'grok-3',      ...OPENAI_COMPAT_PRICES['grok-3'] },
        { model: 'grok-3-mini', ...OPENAI_COMPAT_PRICES['grok-3-mini'] },
      ] as PricingRow[],
    },
    {
      label: p.deepseekLabel,
      sublabel: p.deepseekSublabel,
      accent: 'text-sky-600',
      rows: [
        { model: 'deepseek-chat',     ...OPENAI_COMPAT_PRICES['deepseek-chat'] },
        { model: 'deepseek-reasoner', ...OPENAI_COMPAT_PRICES['deepseek-reasoner'], noteKey: 'reasoning' as const },
      ] as PricingRow[],
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="flex items-center justify-between mb-10 pb-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors mr-1">
              <ArrowLeft size={15} />
            </a>
            <div className="w-px h-5 bg-[var(--border)]" />
            <div className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center">
              <Tag className="w-4 h-4 text-[var(--text)]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{p.title}</h1>
              <p className="text-sm text-[var(--text-2)]">{p.subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => setShowTopUp(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
          >
            <Wallet size={14} />
            {p.topUpBtn}
          </button>
        </header>

        {/* Price tables */}
        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-vault overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-baseline gap-2">
                <h2 className={`font-semibold text-sm ${section.accent}`}>{section.label}</h2>
                {section.sublabel && (
                  <span className="text-[11px] text-[var(--text-3)]">{section.sublabel}</span>
                )}
              </div>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-[var(--surface-raised)] border-b border-[var(--border)]">
                    <th className="text-left px-5 py-2.5 font-medium text-[var(--text-3)] w-1/2">{p.colModel}</th>
                    <th className="text-right px-5 py-2.5 font-medium text-[var(--text-3)]">{p.colInput}</th>
                    <th className="text-right px-5 py-2.5 font-medium text-[var(--text-3)]">{p.colOutput}</th>
                    <th className="text-right px-5 py-2.5 font-medium text-[var(--text-3)] w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {section.rows.map((row) => (
                    <tr key={row.model} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="px-5 py-3 font-mono text-[12px] text-[var(--text-2)]">{row.model}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">{fmt(row.input)}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">{fmt(row.output)}</td>
                      <td className="px-5 py-3 text-right">
                        {row.noteKey && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-3)] font-medium border border-[var(--border)]">
                            {p[row.noteKey]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-[var(--text-4)]">
          {p.disclaimer}
        </p>
      </div>

      {showTopUp && <StripeCheckoutModal onClose={() => setShowTopUp(false)} />}
    </div>
  );
}
