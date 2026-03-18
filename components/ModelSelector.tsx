'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Star, X } from 'lucide-react';

interface ModelOption {
  label: string;
  value: string;
  group?: string;
}

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  placeholder?: string;
}

// Models to pin at the top as "popular"
const POPULAR_MODELS = new Set([
  'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
  'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini',
  'o3', 'o4-mini',
  'gemini-2.5-pro', 'gemini-2.5-flash',
  'deepseek-chat', 'deepseek-r1',
  'grok-3', 'grok-4',
  'qwen-max', 'kimi-k2',
]);

// Priority order for groups
const GROUP_ORDER = [
  'Claude', 'OpenAI', 'Google', 'xAI', 'DeepSeek',
  'Qwen', 'Moonshot', 'GLM', 'Meta', 'Mistral',
  'MiniMax', 'Doubao', 'Baidu', 'Other',
];

export function ModelSelector({ models, value, onChange, loading, placeholder = 'Select model...' }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open]);

  const selectedModel = models.find((m) => m.value === value);

  // Filter + group models
  const { popularFiltered, groupedFiltered } = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? models.filter((m) => m.value.toLowerCase().includes(q) || m.label.toLowerCase().includes(q) || (m.group?.toLowerCase().includes(q)))
      : models;

    const popular = filtered.filter((m) => POPULAR_MODELS.has(m.value));
    const grouped: Record<string, ModelOption[]> = {};
    for (const m of filtered) {
      const g = m.group || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(m);
    }

    return { popularFiltered: popular, groupedFiltered: grouped };
  }, [models, search]);

  const sortedGroups = Object.keys(groupedFiltered).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const toggleGroup = (g: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between border border-black/10 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
          open ? 'border-black/30 ring-1 ring-black/5' : 'hover:border-black/20'
        } ${loading ? 'opacity-50' : ''}`}
        disabled={loading}
      >
        <span className={selectedModel ? 'text-black' : 'text-black/30'}>
          {selectedModel ? selectedModel.value : placeholder}
        </span>
        <ChevronDown size={14} className={`text-black/30 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden"
          style={{ maxHeight: '340px' }}
        >
          {/* Search */}
          <div className="sticky top-0 bg-white border-b border-black/5 px-3 py-2">
            <div className="flex items-center gap-2 bg-black/[0.03] rounded-lg px-2.5 py-1.5">
              <Search size={13} className="text-black/30 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="flex-1 bg-transparent border-none text-xs focus:outline-none placeholder:text-black/25"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-black/20 hover:text-black/50">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto" style={{ maxHeight: '288px' }}>
            {/* Popular section */}
            {popularFiltered.length > 0 && !search && (
              <div className="px-1 pt-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                  <Star size={10} className="text-amber-500" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-black/30">Popular</span>
                </div>
                {popularFiltered.map((m) => (
                  <ModelItem
                    key={`pop-${m.value}`}
                    model={m}
                    selected={value === m.value}
                    onSelect={handleSelect}
                  />
                ))}
                <div className="mx-2.5 my-1 border-t border-black/5" />
              </div>
            )}

            {/* Grouped sections */}
            {sortedGroups.map((g) => {
              const items = groupedFiltered[g];
              const collapsed = collapsedGroups.has(g);
              return (
                <div key={g} className="px-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-black/[0.02] rounded-md transition-colors"
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-black/30">
                      {g}
                      <span className="ml-1 text-black/15">{items.length}</span>
                    </span>
                    <ChevronDown size={10} className={`text-black/20 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed && items.map((m) => (
                    <ModelItem
                      key={m.value}
                      model={m}
                      selected={value === m.value}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              );
            })}

            {/* Empty state */}
            {sortedGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-black/30">
                No models match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelItem({ model, selected, onSelect }: {
  model: ModelOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(model.value)}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
        selected
          ? 'bg-black/[0.04] font-medium'
          : 'hover:bg-black/[0.02]'
      }`}
    >
      <span className="flex-1 truncate font-mono text-[11px]">{model.value}</span>
      {selected && <Check size={12} className="text-black/50 flex-shrink-0" />}
    </button>
  );
}
