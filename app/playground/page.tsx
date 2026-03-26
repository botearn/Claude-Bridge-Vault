'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Square, Wand2, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import { useLang, LangToggle } from '@/components/LangContext';
import { VENDOR_CONFIG, VENDOR_MODELS } from '@/lib/vendors';
import type { VendorId } from '@/lib/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface KeyOption {
  key: string;
  name: string;
  vendor: VendorId;
  model?: string;
}

interface ModelOption {
  value: string;
  label: string;
}

// Anthropic SSE: extract text delta
function parseAnthropicSSE(line: string): string {
  if (!line.startsWith('data: ')) return '';
  const json = line.slice(6).trim();
  if (json === '[DONE]' || !json) return '';
  try {
    const evt = JSON.parse(json);
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      return evt.delta.text ?? '';
    }
  } catch { /* ignore */ }
  return '';
}

// OpenAI SSE: extract text delta
function parseOpenAISSE(line: string): string {
  if (!line.startsWith('data: ')) return '';
  const json = line.slice(6).trim();
  if (json === '[DONE]' || !json) return '';
  try {
    const evt = JSON.parse(json);
    return evt.choices?.[0]?.delta?.content ?? '';
  } catch { /* ignore */ }
  return '';
}

export default function PlaygroundPage() {
  const { t } = useLang();
  const [keys, setKeys] = useState<KeyOption[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [maxTokens, setMaxTokens] = useState('1024');
  const [showConfig, setShowConfig] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load all keys
  useEffect(() => {
    fetch('/api/v1/manage/keys')
      .then(r => r.json())
      .then(data => {
        const entries: KeyOption[] = Object.entries(data as Record<string, { name: string; vendor: VendorId; model?: string }>)
          .map(([key, kd]) => ({ key, name: kd.name, vendor: kd.vendor, model: kd.model }));
        setKeys(entries);
        if (entries.length > 0) {
          setSelectedKey(entries[0].key);
          loadModels(entries[0].vendor, entries[0].model);
        }
      })
      .catch(() => {});
  }, []);

  const loadModels = useCallback((vendor: VendorId, defaultModel?: string) => {
    fetch(`/api/v1/manage/models?vendor=${vendor}`)
      .then(r => r.json())
      .then(d => {
        const opts: ModelOption[] = d.models ?? VENDOR_MODELS[vendor] ?? [];
        setModels(opts);
        setSelectedModel(defaultModel ?? opts[0]?.value ?? '');
      })
      .catch(() => {
        const fallback = VENDOR_MODELS[vendor] ?? [];
        setModels(fallback);
        setSelectedModel(defaultModel ?? fallback[0]?.value ?? '');
      });
  }, []);

  const handleKeyChange = (keyStr: string) => {
    setSelectedKey(keyStr);
    const kd = keys.find(k => k.key === keyStr);
    if (kd) loadModels(kd.vendor, kd.model);
    setError('');
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentKey = keys.find(k => k.key === selectedKey);
  const vendor = currentKey?.vendor ?? 'claude';

  const send = async () => {
    const content = input.trim();
    if (!content || streaming || !selectedKey) return;
    setInput('');
    setError('');

    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);

    // Add empty assistant placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const baseUrl = window.location.origin;
      const isOpenAI = vendor === 'yunwu';
      const endpoint = `${baseUrl}${VENDOR_CONFIG[vendor].basePath}`;

      let body: Record<string, unknown>;
      if (isOpenAI) {
        body = {
          model: selectedModel,
          stream: true,
          max_tokens: parseInt(maxTokens, 10) || 1024,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        };
      } else {
        body = {
          model: selectedModel,
          stream: true,
          max_tokens: parseInt(maxTokens, 10) || 1024,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        };
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': selectedKey,
      };
      if (!isOpenAI) headers['anthropic-version'] = '2023-06-01';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const delta = isOpenAI ? parseOpenAISSE(line) : parseAnthropicSSE(line);
          if (delta) {
            accumulated += delta;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: accumulated };
              return updated;
            });
          }
        }
      }

      // If accumulated is empty (non-streaming fallback), try to parse as JSON
      if (!accumulated) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '[No content returned]' };
          return updated;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User stopped — keep partial content
      } else {
        const msg = err instanceof Error ? err.message : 'Request failed';
        setError(msg);
        setMessages(prev => prev.slice(0, -1)); // Remove empty assistant message
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 px-6 py-10">

        {/* Header */}
        <header className="flex items-center justify-between mb-6 border-b border-[var(--border)] pb-5">
          <div className="flex items-center gap-3">
            <a href="/vault" className="text-[13px] text-black/40 hover:text-black transition-colors mr-1">
              <ArrowLeft size={15} />
            </a>
            <div className="w-px h-5 bg-black/10" />
            <div className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {(t as any).playground?.title ?? 'API Playground'}
              </h1>
              <p className="text-xs text-black/40">
                {(t as any).playground?.subtitle ?? 'Test your sub-keys with live requests'}
              </p>
            </div>
          </div>
          <LangToggle />
        </header>

        {/* Config bar */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {/* Key selector */}
          {keys.length > 0 ? (
            <div className="relative">
              <select
                value={selectedKey}
                onChange={e => handleKeyChange(e.target.value)}
                className="text-xs border border-black/10 rounded-lg pl-3 pr-8 py-2 bg-white focus:outline-none focus:border-black/30 appearance-none min-w-[160px]"
              >
                {keys.map(k => (
                  <option key={k.key} value={k.key}>
                    {k.name} ({k.key.slice(-8)})
                  </option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
            </div>
          ) : (
            <span className="text-xs text-black/40 border border-black/10 rounded-lg px-3 py-2">
              No keys — create one first
            </span>
          )}

          {/* Model selector */}
          {models.length > 0 && (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="text-xs border border-black/10 rounded-lg pl-3 pr-8 py-2 bg-white focus:outline-none focus:border-black/30 appearance-none min-w-[180px]"
              >
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
            </div>
          )}

          {/* Config toggle */}
          <button
            onClick={() => setShowConfig(v => !v)}
            className="text-xs border border-black/10 rounded-lg px-3 py-2 hover:bg-black/5 transition-colors text-black/50"
          >
            Max tokens: {maxTokens}
          </button>

          {/* Clear */}
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setError(''); }}
              className="text-xs text-black/30 hover:text-black ml-auto transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Max tokens config */}
        {showConfig && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-white border border-black/10 rounded-xl">
            <label className="text-[10px] font-semibold text-black/40 uppercase tracking-widest whitespace-nowrap">Max Tokens</label>
            <input
              type="number"
              min="1"
              max="100000"
              value={maxTokens}
              onChange={e => setMaxTokens(e.target.value)}
              className="w-24 border border-black/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black/30"
            />
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-vault overflow-hidden flex flex-col" style={{ minHeight: '400px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-black/25 py-16">
                <Wand2 size={32} className="mb-3 opacity-30" />
                <p className="text-sm">
                  {(t as any).playground?.emptyState ?? 'Type a message to start testing your API key'}
                </p>
                <p className="text-xs mt-1">
                  Shift+Enter for newline · Enter to send
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-black text-white'
                    : 'bg-white border border-black/8 text-black'
                }`}>
                  {msg.content || (msg.role === 'assistant' && streaming ? (
                    <span className="inline-flex items-center gap-1 text-black/30">
                      <Loader2 size={12} className="animate-spin" />
                      <span className="text-xs">thinking…</span>
                    </span>
                  ) : null)}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-5 mb-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {/* Input bar */}
          <div className="border-t border-black/5 p-4">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  keys.length === 0
                    ? 'Create a sub-key first to start testing'
                    : ((t as any).playground?.inputPlaceholder ?? 'Type a message… (Enter to send)')
                }
                disabled={streaming || keys.length === 0}
                rows={1}
                className="flex-1 resize-none border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black/30 disabled:opacity-50 bg-white"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-500 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Square size={12} />
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim() || keys.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/80 disabled:opacity-30 transition-colors"
                >
                  <Send size={12} />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        {currentKey && (
          <div className="mt-3 flex items-center gap-3 text-[10px] text-black/30">
            <span className="border border-black/10 rounded-full px-2 py-0.5 uppercase tracking-wider">
              {VENDOR_CONFIG[vendor]?.label ?? vendor}
            </span>
            <span className="font-mono">{selectedKey.slice(-16)}</span>
            {selectedModel && <span className="font-mono">{selectedModel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
