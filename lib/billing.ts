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

  // Gemini: usageMetadata: { promptTokenCount, candidatesTokenCount }
  if (vendor === 'gemini') {
    const usageMetadata = (data as { usageMetadata?: unknown }).usageMetadata;
    if (usageMetadata && typeof usageMetadata === 'object') {
      const um = usageMetadata as Record<string, unknown>;
      const prompt = typeof um.promptTokenCount === 'number' ? um.promptTokenCount : 0;
      const candidates = typeof um.candidatesTokenCount === 'number' ? um.candidatesTokenCount : 0;
      if (prompt || candidates) return { inputTokens: prompt, outputTokens: candidates };
    }
  }

  return null;
}

// Price table is a best-effort estimate (USD per 1M tokens)
const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  // Anthropic examples
  'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-latest': { input: 0.25, output: 1.25 },
  'claude-3-opus-latest': { input: 15.0, output: 75.0 },

  // Defaults
  __default__: { input: 3.0, output: 15.0 },
};

export function estimateCostUsd(model: string | undefined, usage: TokenUsage): number {
  const price = (model && PRICES_PER_MILLION[model]) ? PRICES_PER_MILLION[model] : PRICES_PER_MILLION.__default__;
  const inputCost = (usage.inputTokens / 1_000_000) * price.input;
  const outputCost = (usage.outputTokens / 1_000_000) * price.output;
  return inputCost + outputCost;
}

export function safeModelFromBody(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return typeof parsed.model === 'string' ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}
