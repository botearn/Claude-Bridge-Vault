import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor } from '@/lib/vendors';
import { buildUpstreamRequest } from '@/lib/proxy';
import { extractTokenUsage, estimateVendorCostUsd, safeModelFromBody } from '@/lib/billing';
import { logEvent } from '@/lib/events';
import { proxyRateLimit } from '@/lib/ratelimit';
import { notify } from '@/lib/webhook';
import { recordDailyKeyUsage } from '@/lib/daily-stats';

type RouteContext = {
  params: Promise<{ vendor: string; path?: string[] }>;
};

// Simple round-robin counter per vendor for master key rotation
const keyIndex: Record<string, number> = {};
function pickMasterKey(vendor: string, keys: string[]): string {
  if (keys.length === 1) return keys[0];
  const idx = (keyIndex[vendor] ?? 0) % keys.length;
  keyIndex[vendor] = idx + 1;
  return keys[idx];
}

const parseKeyRecord = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Failed to parse key record', error);
      return null;
    }
  }
  return value;
};

function isStreaming(rawBody: string): boolean {
  try {
    return JSON.parse(rawBody)?.stream === true;
  } catch {
    return false;
  }
}

// Parse SSE stream to extract token usage (supports Anthropic and OpenAI-compatible formats)
async function extractTokensFromSSE(
  stream: ReadableStream,
  vendor: string,
): Promise<{ inputTokens: number; outputTokens: number; realModel?: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;
  let realModel: string | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const evt = JSON.parse(jsonStr) as Record<string, unknown>;

          // Extract real model from response
          if (!realModel && typeof evt.model === 'string') {
            realModel = evt.model;
          }

          if (vendor === 'claude' || vendor === 'youragent') {
            // Anthropic SSE: message_start has input, message_delta has output
            if (evt.type === 'message_start') {
              const msg = evt.message as Record<string, unknown> | undefined;
              if (!realModel && typeof msg?.model === 'string') realModel = msg.model;
              const usage = msg?.usage as Record<string, number> | undefined;
              if (usage) { inputTokens = usage.input_tokens ?? 0; outputTokens = usage.output_tokens ?? 0; }
            } else if (evt.type === 'message_delta') {
              const usage = evt.usage as Record<string, number> | undefined;
              if (usage?.output_tokens) outputTokens = usage.output_tokens;
            }
          } else if (vendor === 'yunwu') {
            // OpenAI-compatible SSE: final chunk contains usage with prompt_tokens + completion_tokens
            const usage = evt.usage as Record<string, number> | undefined;
            if (usage) {
              if (typeof usage.prompt_tokens === 'number') inputTokens = usage.prompt_tokens;
              if (typeof usage.completion_tokens === 'number') outputTokens = usage.completion_tokens;
            }
          }
        } catch { /* ignore malformed lines */ }
      }
    }
  } catch { /* ignore stream errors */ } finally {
    reader.releaseLock();
  }
  return { inputTokens, outputTokens, realModel };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { vendor } = await context.params;

  if (!isValidVendor(vendor)) {
    return NextResponse.json({ error: 'Unknown vendor' }, { status: 404 });
  }

  const subKey = req.headers.get('x-api-key');
  const masterKeys = (process.env[`${vendor.toUpperCase()}_MASTER_KEY`] ?? '')
    .split(',').map(k => k.trim()).filter(Boolean);

  if (masterKeys.length === 0) {
    console.error(`Missing ${vendor.toUpperCase()}_MASTER_KEY environment variable`);
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
  }

  if (!subKey) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 401 });
  }

  try {
    const keyDataStr = await redis.hget('vault:subkeys', subKey);
    const keyData = parseKeyRecord(keyDataStr);

    if (!keyData || (keyData as { vendor?: string }).vendor !== vendor) {
      return NextResponse.json({ error: 'Invalid or mismatched key' }, { status: 403 });
    }

    const kd = keyData as {
      expiresAt?: string | null;
      totalQuota?: number | null;
      usage?: number;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
    };

    const kMeta = { vendor: (keyData as { vendor: string }).vendor, group: (keyData as { group: string }).group, name: (keyData as { name: string }).name };

    if (kd.expiresAt && new Date(kd.expiresAt) < new Date()) {
      const ts = new Date().toISOString();
      void logEvent({ type: 'key.expired', subKey: subKey.slice(-8), ...kMeta, timestamp: ts });
      notify({ event: 'key.expired', subKey: subKey.slice(-8), ...kMeta, detail: `expired at ${kd.expiresAt}`, timestamp: ts });
      return NextResponse.json({ error: 'Key expired' }, { status: 403 });
    }

    // Rate limit check: sliding window per sub-key
    const rl = await proxyRateLimit.limit(subKey);
    if (!rl.success) {
      const retryAfter = Math.ceil((rl.reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    // Quota check: token-based (totalQuota = max token budget)
    if (kd.totalQuota != null) {
      const usedTokens = (kd.inputTokens ?? 0) + (kd.outputTokens ?? 0);
      if (usedTokens >= kd.totalQuota) {
        const ts = new Date().toISOString();
        void logEvent({ type: 'quota.exceeded', subKey: subKey.slice(-8), ...kMeta, timestamp: ts });
        notify({ event: 'quota.exceeded', subKey: subKey.slice(-8), ...kMeta, detail: `${usedTokens}/${kd.totalQuota} tokens`, timestamp: ts });
        return NextResponse.json({ error: 'Quota exceeded' }, { status: 429 });
      }
    }

    let rawBody = await req.text();
    let model = safeModelFromBody(rawBody);
    const streaming = isStreaming(rawBody);

    // Auto-inject model from key config if request doesn't specify one
    const keyModel = (keyData as { model?: string }).model;
    if (!model && keyModel) {
      try {
        const parsed = JSON.parse(rawBody);
        parsed.model = keyModel;
        rawBody = JSON.stringify(parsed);
        model = keyModel;
      } catch { /* keep original body */ }
    }

    // Inject stream_options for OpenAI-compatible vendors so usage is included in final SSE chunk
    if (streaming && vendor === 'yunwu') {
      try {
        const parsed = JSON.parse(rawBody);
        if (!parsed.stream_options?.include_usage) {
          parsed.stream_options = { ...parsed.stream_options, include_usage: true };
          rawBody = JSON.stringify(parsed);
        }
      } catch { /* keep original body */ }
    }

    // Try master keys with round-robin + fallback on 401/429/5xx
    let response: Response | null = null;
    let usedKeyIdx = 0;
    const firstKey = pickMasterKey(vendor, masterKeys);
    const orderedKeys = [firstKey, ...masterKeys.filter(k => k !== firstKey)];

    for (let i = 0; i < orderedKeys.length; i++) {
      const upstream = buildUpstreamRequest(vendor, orderedKeys[i], rawBody);
      if (i === 0) console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} model=${model ?? '?'} stream=${streaming} → ${upstream.url}`);

      const res = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: upstream.body,
      });

      if (res.ok) { response = res; usedKeyIdx = i; break; }

      // Retry with next key on auth failure or rate limit from upstream
      const retryable = res.status === 401 || res.status === 429 || res.status >= 500;
      if (retryable && i < orderedKeys.length - 1) {
        console.warn(`[proxy] ${vendor} master-key#${i} ✗ HTTP ${res.status}, trying next key`);
        continue;
      }

      // Last key or non-retryable error — return upstream error
      console.warn(`[proxy] ${vendor} key=${subKey.slice(-8)} ✗ HTTP ${res.status}`);
      const errData = await res.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(errData, { status: res.status });
    }

    if (!response) {
      return NextResponse.json({ error: 'All upstream keys failed' }, { status: 502 });
    }
    if (usedKeyIdx > 0) {
      console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} ✓ succeeded with master-key#${usedKeyIdx}`);
    }

    // Increment call count + lastUsed (fire-and-forget)
    const now = new Date().toISOString();
    void redis.hset('vault:subkeys', {
      [subKey]: JSON.stringify({ ...keyData, usage: (kd.usage ?? 0) + 1, lastUsed: now }),
    });

    const today = now.slice(0, 10);
    void redis.incr(`vault:daily:calls:${today}`)
      .then(() => redis.expire(`vault:daily:calls:${today}`, 35 * 24 * 3600))
      .catch((err) => console.warn('[analytics] daily counter failed', err));

    // Streaming: pipe SSE through, parse tokens in background
    if (streaming && response.body) {
      const [clientStream, parseStream] = response.body.tee();

      void extractTokensFromSSE(parseStream, vendor).then(async ({ inputTokens, outputTokens, realModel }) => {
        if (inputTokens === 0 && outputTokens === 0) return;
        const effectiveModel = realModel ?? model;
        const costInc = estimateVendorCostUsd(vendor, effectiveModel, { inputTokens, outputTokens });
        console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} ✓ stream model=${effectiveModel ?? '?'} in=${inputTokens} out=${outputTokens} cost=$${costInc.toFixed(6)}`);
        void logEvent({ type: 'proxy.success', subKey: subKey.slice(-8), ...kMeta, timestamp: new Date().toISOString(), model: effectiveModel ?? undefined, inputTokens, outputTokens });
        const latest = parseKeyRecord(await redis.hget('vault:subkeys', subKey)) ?? keyData;
        const lk = latest as { inputTokens?: number; outputTokens?: number; costUsd?: number };
        void redis.hset('vault:subkeys', {
          [subKey]: JSON.stringify({
            ...latest,
            inputTokens: (lk.inputTokens ?? 0) + inputTokens,
            outputTokens: (lk.outputTokens ?? 0) + outputTokens,
            costUsd: (lk.costUsd ?? 0) + costInc,
          }),
        });
        void recordDailyKeyUsage(subKey, today, { calls: 1, inputTokens, outputTokens, costUsd: costInc });
      });

      const headers = new Headers();
      headers.set('Content-Type', response.headers.get('Content-Type') ?? 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      return new Response(clientStream, { status: response.status, headers });
    }

    // Non-streaming: parse JSON + update tokens/cost
    const data = await response.json() as Record<string, unknown>;
    const realModel = typeof data.model === 'string' ? data.model : undefined;
    const effectiveModel = realModel ?? model;
    const tokenUsage = extractTokenUsage(vendor, data);
    const inputInc = tokenUsage?.inputTokens ?? 0;
    const outputInc = tokenUsage?.outputTokens ?? 0;
    const costInc = tokenUsage ? estimateVendorCostUsd(vendor, effectiveModel, tokenUsage) : 0;
    console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} ✓ model=${effectiveModel ?? '?'} in=${inputInc} out=${outputInc} cost=$${costInc.toFixed(6)}`);
    void logEvent({ type: 'proxy.success', subKey: subKey.slice(-8), ...kMeta, timestamp: new Date().toISOString(), model: effectiveModel ?? undefined, inputTokens: inputInc, outputTokens: outputInc });

    const latest = parseKeyRecord(await redis.hget('vault:subkeys', subKey)) ?? keyData;
    const lk = latest as { inputTokens?: number; outputTokens?: number; costUsd?: number };
    void redis.hset('vault:subkeys', {
      [subKey]: JSON.stringify({
        ...latest,
        inputTokens: (lk.inputTokens ?? 0) + inputInc,
        outputTokens: (lk.outputTokens ?? 0) + outputInc,
        costUsd: (lk.costUsd ?? 0) + costInc,
      }),
    });
    void recordDailyKeyUsage(subKey, today, { calls: 1, inputTokens: inputInc, outputTokens: outputInc, costUsd: costInc });

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[proxy] ${vendor} key=${subKey.slice(-8)} fatal`, error);
    return NextResponse.json({ error: 'Proxy Error' }, { status: 500 });
  }
}
