import type { VendorId } from './types';

type UsageLike = Record<string, unknown>;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export function extractTokenUsage(vendor: VendorId, data: UsageLike): TokenUsage | null {
  if (!data || typeof data !== 'object') return null;

  // Anthropic-style: { usage: { input_tokens, output_tokens } }
  const usage = (data as { usage?: unknown }).usage;
  if (usage && typeof usage === 'object') {
    const u = usage as Record<string, unknown>;
    const input = typeof u.input_tokens === 'number' ? u.input_tokens : undefined;
    const output = typeof u.output_tokens === 'number' ? u.output_tokens : undefined;
    if (typeof input === 'number' || typeof output === 'number') {
      return {
        inputTokens: typeof input === 'number' ? input : 0,
        outputTokens: typeof output === 'number' ? output : 0,
      };
    }

    // OpenAI-style: { usage: { prompt_tokens, completion_tokens } }
    const prompt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined;
    const completion = typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined;
    if (typeof prompt === 'number' || typeof completion === 'number') {
      return {
        inputTokens: typeof prompt === 'number' ? prompt : 0,
        outputTokens: typeof completion === 'number' ? completion : 0,
      };
    }
  }

  return null;
}

// Price tables: best-effort estimates (USD per 1M tokens)
// All costs are in USD. These are official API list prices, NOT actual billed amounts.
// - Claude: Anthropic official pricing
// - YourAgent: Claude official × 4% (YOURAGENT_PRICE_MULTIPLIER) — update if pricing changes
// - Yunwu: OpenAI official pricing — TODO: update to Yunwu's actual reseller pricing when available

const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  // Opus 4.6 / 4
  'claude-opus-4-6':           { input: 15.0,  output: 75.0  },
  'claude-opus-4-20250514':    { input: 15.0,  output: 75.0  },
  'claude-3-opus-latest':      { input: 15.0,  output: 75.0  },
  'claude-3-opus-20240229':    { input: 15.0,  output: 75.0  },
  // Sonnet 4.6 / 4 / 3.5
  'claude-sonnet-4-6':         { input: 3.0,   output: 15.0  },
  'claude-sonnet-4-20250514':  { input: 3.0,   output: 15.0  },
  'claude-3-5-sonnet-latest':  { input: 3.0,   output: 15.0  },
  'claude-3-5-sonnet-20241022':{ input: 3.0,   output: 15.0  },
  // Haiku 4.5 / 3.5
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.0   },
  'claude-3-5-haiku-latest':   { input: 0.80,  output: 4.0   },
  'claude-3-5-haiku-20241022': { input: 0.80,  output: 4.0   },
  // Thinking variants (same price as base model)
  'claude-opus-4-6-thinking':  { input: 15.0,  output: 75.0  },
  'claude-sonnet-4-6-thinking':{ input: 3.0,   output: 15.0  },
  __default__:                 { input: 3.0,   output: 15.0  },
};

// Yunwu proxies OpenAI-compatible models
const OPENAI_COMPAT_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o':              { input: 2.50,  output: 10.0  },
  'gpt-4o-2024-11-20':   { input: 2.50,  output: 10.0  },
  'gpt-4o-mini':         { input: 0.15,  output: 0.60  },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
  'gpt-4-turbo':         { input: 10.0,  output: 30.0  },
  'gpt-4':               { input: 30.0,  output: 60.0  },
  'gpt-3.5-turbo':       { input: 0.50,  output: 1.50  },
  'o1':                  { input: 15.0,  output: 60.0  },
  'o1-mini':             { input: 3.0,   output: 12.0  },
  'o1-pro':              { input: 150.0, output: 600.0 },
  'o3':                  { input: 10.0,  output: 40.0  },
  'o3-mini':             { input: 1.10,  output: 4.40  },
  'o4-mini':             { input: 1.10,  output: 4.40  },
  __default__:           { input: 2.50,  output: 10.0  },
};

// Vendor → price table mapping
const VENDOR_PRICE_TABLES: Record<string, Record<string, { input: number; output: number }>> = {
  claude:    ANTHROPIC_PRICES,
  youragent: ANTHROPIC_PRICES,
  yunwu:     OPENAI_COMPAT_PRICES,
};

// YourAgent pricing rule: same token usage costs 4% of official Claude.
const YOURAGENT_PRICE_MULTIPLIER = 0.04;

function lookupPrice(vendor: string, model: string | undefined): { input: number; output: number } {
  const table = VENDOR_PRICE_TABLES[vendor] ?? ANTHROPIC_PRICES;
  if (model) {
    // Exact match first
    if (table[model]) return table[model];
    // Prefix match: "gpt-4o-2024-08-06" → try "gpt-4o"
    for (const key of Object.keys(table)) {
      if (key !== '__default__' && model.startsWith(key)) return table[key];
    }
  }
  return table.__default__;
}

export function estimateVendorCostUsd(vendor: VendorId, model: string | undefined, usage: TokenUsage): number {
  const price = lookupPrice(vendor, model);
  const baseCost = (usage.inputTokens / 1_000_000) * price.input
                 + (usage.outputTokens / 1_000_000) * price.output;

  if (vendor === 'youragent') {
    return baseCost * YOURAGENT_PRICE_MULTIPLIER;
  }
  return baseCost;
}

// Keep backward compat for any callers
export function estimateClaudeOfficialCostUsd(model: string | undefined, usage: TokenUsage): number {
  return estimateVendorCostUsd('claude', model, usage);
}

export function safeModelFromBody(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return typeof parsed.model === 'string' ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}
