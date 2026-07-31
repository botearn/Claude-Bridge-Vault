import type { VendorId } from './types';

type UsageLike = Record<string, unknown>;
const MAX_BOTEARN_INPUT_TOKEN_BOUND = 180_000;

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export interface ModelPrice {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

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
        cachedInputTokens: typeof u.cache_read_input_tokens === 'number'
          ? u.cache_read_input_tokens
          : 0,
        cacheWriteTokens: typeof u.cache_creation_input_tokens === 'number'
          ? u.cache_creation_input_tokens
          : 0,
        outputTokens: typeof output === 'number' ? output : 0,
        reasoningTokens: 0,
      };
    }

    // OpenAI-style: { usage: { prompt_tokens, completion_tokens } }
    const prompt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined;
    const completion = typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined;
    if (typeof prompt === 'number' || typeof completion === 'number') {
      const promptDetails = u.prompt_tokens_details as Record<string, unknown> | undefined;
      const completionDetails = u.completion_tokens_details as Record<string, unknown> | undefined;
      const cached = typeof promptDetails?.cached_tokens === 'number'
        ? promptDetails.cached_tokens
        : 0;
      return {
        inputTokens: Math.max((typeof prompt === 'number' ? prompt : 0) - cached, 0),
        cachedInputTokens: cached,
        cacheWriteTokens: 0,
        outputTokens: typeof completion === 'number' ? completion : 0,
        reasoningTokens: typeof completionDetails?.reasoning_tokens === 'number'
          ? completionDetails.reasoning_tokens
          : 0,
      };
    }
  }

  return null;
}

// Price tables: best-effort estimates (USD per 1M tokens)
// All costs are in USD. These are official API list prices, NOT actual billed amounts.
// - Claude: Anthropic official pricing
// - Yunwu: OpenAI official pricing — TODO: update to Yunwu's actual reseller pricing when available

export const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  // 当前直连 API 模型。Sonnet 5 首发价格在 2026-08-31 后结束。
  'claude-fable-5':            { input: 10.0,  output: 50.0  },
  'claude-opus-5':             { input: 5.0,   output: 25.0  },
  'claude-sonnet-5':           { input: 2.0,   output: 10.0  },
  // Opus 4.7 / 4.6 / 4
  'claude-opus-4-7':           { input: 15.0,  output: 75.0  },
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
  'claude-haiku-4-5-20251001': { input: 1.0,   output: 5.0   },
  'claude-3-5-haiku-latest':   { input: 0.80,  output: 4.0   },
  'claude-3-5-haiku-20241022': { input: 0.80,  output: 4.0   },
  // Thinking variants (same price as base model)
  'claude-opus-4-6-thinking':  { input: 15.0,  output: 75.0  },
  'claude-sonnet-4-6-thinking':{ input: 3.0,   output: 15.0  },
  // PaleBlueDot model IDs (anthropic/<tier>-<ver>, and response form anthropic/claude-<ver>-<tier>-*)
  'anthropic/claude-opus-4.6':     { input: 15.0,  output: 75.0  },
  'anthropic/claude-sonnet-4.6':   { input: 3.0,   output: 15.0  },
  'anthropic/claude-opus-4.5':     { input: 15.0,  output: 75.0  },
  'anthropic/claude-sonnet-4.5':   { input: 3.0,   output: 15.0  },
  'anthropic/claude-haiku-4.5':    { input: 1.0,   output: 5.0   },
  'anthropic/claude-sonnet-4':     { input: 3.0,   output: 15.0  },
  'anthropic/claude-opus-4':       { input: 15.0,  output: 75.0  },
  'anthropic/claude-4.6-opus':     { input: 15.0,  output: 75.0  },
  'anthropic/claude-4.6-sonnet':   { input: 3.0,   output: 15.0  },
  'anthropic/claude-4.5-opus':     { input: 15.0,  output: 75.0  },
  'anthropic/claude-4.5-sonnet':   { input: 3.0,   output: 15.0  },
  'anthropic/claude-4.5-haiku':    { input: 0.80,  output: 4.0   },
  'anthropic/claude-4-sonnet':     { input: 3.0,   output: 15.0  },
  'anthropic/claude-4-opus':       { input: 15.0,  output: 75.0  },
  __default__:                 { input: 3.0,   output: 15.0  },
};

// Yunwu proxies OpenAI-compatible models (includes all vendors routed through Yunwu)
export const OPENAI_COMPAT_PRICES: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4.1':             { input: 2.00,  output: 8.0   },
  'gpt-4.1-mini':        { input: 0.40,  output: 1.60  },
  'gpt-4.1-nano':        { input: 0.10,  output: 0.40  },
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
  // Google Gemini
  'gemini-2.5-pro':      { input: 1.25,  output: 10.0  },
  'gemini-2.5-flash':    { input: 0.15,  output: 0.60  },
  'gemini-2.0-flash':    { input: 0.10,  output: 0.40  },
  // xAI Grok
  'grok-3':              { input: 3.0,   output: 15.0  },
  'grok-3-mini':         { input: 0.30,  output: 0.50  },
  // DeepSeek
  'deepseek-chat':       { input: 0.27,  output: 1.10  },
  'deepseek-reasoner':   { input: 0.55,  output: 2.19  },
  // Claude via OpenAI-compat gateways (same Anthropic pricing)
  'claude-opus-4-7':           { input: 15.0,  output: 75.0  },
  'claude-opus-4-6':           { input: 15.0,  output: 75.0  },
  'claude-sonnet-4-6':         { input: 3.0,   output: 15.0  },
  'claude-haiku-4-5-20251001': { input: 1.0,   output: 5.0   },
  'claude-sonnet-4-20250514':  { input: 3.0,   output: 15.0  },
  'claude-opus-4-20250514':    { input: 15.0,  output: 75.0  },
  // Amazon Bedrock — Claude (cross-region inference profile + native IDs)
  'us.anthropic.claude-opus-4-7':       { input: 15.0,  output: 75.0  },
  'us.anthropic.claude-opus-4-6':       { input: 15.0,  output: 75.0  },
  'us.anthropic.claude-opus-4-1':       { input: 15.0,  output: 75.0  },
  'us.anthropic.claude-opus-4-5':       { input: 15.0,  output: 75.0  },
  'us.anthropic.claude-opus-4':         { input: 15.0,  output: 75.0  },
  'us.anthropic.claude-sonnet-4-6':     { input: 3.0,   output: 15.0  },
  'us.anthropic.claude-sonnet-4-5':     { input: 3.0,   output: 15.0  },
  'us.anthropic.claude-sonnet-4':       { input: 3.0,   output: 15.0  },
  'us.anthropic.claude-3-7-sonnet':     { input: 3.0,   output: 15.0  },
  'us.anthropic.claude-3-5-sonnet':     { input: 3.0,   output: 15.0  },
  'us.anthropic.claude-haiku-4-5':      { input: 1.0,   output: 5.0   },
  'us.anthropic.claude-3-5-haiku':      { input: 0.80,  output: 4.0   },
  // Amazon Nova
  'amazon.nova-pro':                    { input: 0.80,  output: 3.20  },
  'amazon.nova-lite':                   { input: 0.06,  output: 0.24  },
  'amazon.nova-micro':                  { input: 0.035, output: 0.14  },
  __default__:           { input: 2.50,  output: 10.0  },
};

// Vendor → price table mapping
const VENDOR_PRICE_TABLES: Record<string, Record<string, { input: number; output: number }>> = {
  claude:       ANTHROPIC_PRICES,
  tokenutopia:  ANTHROPIC_PRICES,
  palebluedot:  ANTHROPIC_PRICES,
  clawos:            OPENAI_COMPAT_PRICES,
  'clawos-overseas': OPENAI_COMPAT_PRICES,
  amazon:            OPENAI_COMPAT_PRICES,
};

const TRUSTED_BILLING_VENDORS = new Set<string>(['claude', 'amazon']);

function withCachePrices(
  vendor: string,
  price: { input: number; output: number },
): ModelPrice {
  if (vendor === 'claude') {
    return {
      input: price.input,
      cachedInput: price.input * 0.1,
      cacheWrite: price.input * 1.25,
      output: price.output,
    };
  }
  return {
    input: price.input,
    cachedInput: price.input,
    cacheWrite: price.input,
    output: price.output,
  };
}

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
  const price = withCachePrices(vendor, lookupPrice(vendor, model));
  return (usage.inputTokens / 1_000_000) * price.input
       + (usage.cachedInputTokens / 1_000_000) * price.cachedInput
       + (usage.cacheWriteTokens / 1_000_000) * price.cacheWrite
       + (usage.outputTokens / 1_000_000) * price.output;
}

// Keep backward compat for any callers
export function estimateClaudeOfficialCostUsd(model: string | undefined, usage: TokenUsage): number {
  return estimateVendorCostUsd('claude', model, usage);
}

export function safeModelFromBody(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof parsed.model !== 'string') return undefined;
    // Cap length to prevent oversized strings from being stored in Redis
    return parsed.model.length <= 128 ? parsed.model : parsed.model.slice(0, 128);
  } catch {
    return undefined;
  }
}

export function getExplicitModelPrice(vendor: VendorId, model: string): ModelPrice | null {
  if (!TRUSTED_BILLING_VENDORS.has(vendor)) return null;
  if (vendor === 'claude'
    && model === 'claude-sonnet-5'
    && Date.now() >= Date.parse('2026-09-01T00:00:00.000Z')) {
    return withCachePrices(vendor, { input: 3.0, output: 15.0 });
  }
  const table = VENDOR_PRICE_TABLES[vendor];
  const price = table?.[model];
  if (!price) return null;
  return withCachePrices(vendor, price);
}

export function usdPerMillionToNanoUsdPerToken(value: number): bigint {
  return BigInt(Math.round(value * 1_000));
}

export function calculateUsageCostNanoUsd(price: ModelPrice, usage: TokenUsage): bigint {
  return BigInt(usage.inputTokens) * usdPerMillionToNanoUsdPerToken(price.input)
    + BigInt(usage.cachedInputTokens) * usdPerMillionToNanoUsdPerToken(price.cachedInput)
    + BigInt(usage.cacheWriteTokens) * usdPerMillionToNanoUsdPerToken(price.cacheWrite)
    + BigInt(usage.outputTokens) * usdPerMillionToNanoUsdPerToken(price.output);
}

function countImageInputs(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countImageInputs(item), 0);
  }
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const current = record.type === 'image'
    || record.type === 'image_url'
    || record.type === 'input_image'
    ? 1
    : 0;
  return current + Object.values(record).reduce<number>(
    (sum, item) => sum + countImageInputs(item),
    0,
  );
}

function containsLongCacheTtl(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsLongCacheTtl);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.ttl === '1h') return true;
  return Object.values(record).some(containsLongCacheTtl);
}

function containsUnpricedProviderTool(value: Record<string, unknown>): boolean {
  if (value.mcp_servers !== undefined
    || value.web_search_options !== undefined
    || value.container !== undefined) {
    return true;
  }
  if (!Array.isArray(value.tools)) return false;
  return value.tools.some((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const type = (tool as Record<string, unknown>).type;
    return typeof type === 'string' && type.length > 0 && type !== 'function';
  });
}

function inputTokenUpperBound(value: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
    + countImageInputs(value) * 5_000;
}

export function constrainBotEarnRequestBody(rawBody: string): {
  body: string;
  errorCode: string | null;
} {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { body: rawBody, errorCode: 'AI_REQUEST_INVALID' };
    }
    if (containsLongCacheTtl(parsed)) {
      return { body: rawBody, errorCode: 'AI_CACHE_TTL_NOT_SUPPORTED' };
    }
    if (containsUnpricedProviderTool(parsed)) {
      return { body: rawBody, errorCode: 'AI_BILLING_UNIT_NOT_SUPPORTED' };
    }
    if (inputTokenUpperBound(parsed) > MAX_BOTEARN_INPUT_TOKEN_BOUND) {
      return { body: rawBody, errorCode: 'AI_INPUT_LIMIT_EXCEEDED' };
    }

    const outputFields = ['max_tokens', 'max_completion_tokens'] as const;
    const existingField = outputFields.find(field => parsed[field] !== undefined);
    const field = existingField ?? 'max_tokens';
    const requested = parsed[field];
    if (requested !== undefined
      && (typeof requested !== 'number'
        || !Number.isSafeInteger(requested)
        || requested < 1)) {
      return { body: rawBody, errorCode: 'AI_REQUEST_INVALID' };
    }
    parsed[field] = Math.min(
      typeof requested === 'number' ? requested : 1024,
      65_536,
    );
    return { body: JSON.stringify(parsed), errorCode: null };
  } catch {
    return { body: rawBody, errorCode: 'AI_REQUEST_INVALID' };
  }
}

export function estimateMaxCostNanoUsd(rawBody: string, price: ModelPrice): bigint {
  let maxOutputTokens = 1024;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    const requested = typeof parsed.max_tokens === 'number'
      ? parsed.max_tokens
      : typeof parsed.max_completion_tokens === 'number'
        ? parsed.max_completion_tokens
        : undefined;
    if (requested !== undefined && Number.isInteger(requested) && requested > 0) {
      maxOutputTokens = Math.min(requested, 65_536);
    }
  } catch {
    // 非法 JSON 会在上游调用前被现有请求构建流程拒绝。
  }

  let inputTokenBound: number;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    inputTokenBound = inputTokenUpperBound(parsed);
  } catch {
    inputTokenBound = new TextEncoder().encode(rawBody).byteLength;
  }
  const inputUnit = usdPerMillionToNanoUsdPerToken(price.input);
  const cacheWriteUnit = usdPerMillionToNanoUsdPerToken(price.cacheWrite);
  const conservativeInputUnit = inputUnit > cacheWriteUnit ? inputUnit : cacheWriteUnit;
  const outputUnit = usdPerMillionToNanoUsdPerToken(price.output);
  return BigInt(inputTokenBound) * conservativeInputUnit
    + BigInt(maxOutputTokens) * outputUnit;
}
