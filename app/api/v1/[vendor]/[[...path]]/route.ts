import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor } from '@/lib/vendors';
import { buildUpstreamRequest } from '@/lib/proxy';
import { extractTokenUsage, estimateVendorCostUsd, safeModelFromBody } from '@/lib/billing';
import { logEvent } from '@/lib/events';
import { proxyRateLimit } from '@/lib/ratelimit';
import { notify } from '@/lib/webhook';
import { recordDailyKeyUsage } from '@/lib/daily-stats';
import { getBalance, deductBalance } from '@/lib/balance';
import { getChannelsForProxy, recordChannelSuccess, recordChannelFailure } from '@/lib/channels';
import { checkRpmLimit, checkTpmLimit, getTpmUsage } from '@/lib/key-ratelimit';
import { writeUsageLog } from '@/lib/usage-log';
import type { VendorId } from '@/lib/types';

type RouteContext = {
  params: Promise<{ vendor: string; path?: string[] }>;
};

/** Resolve channels for proxy: Redis channels first, fall back to env var keys */
interface UpstreamChannel { id: string | null; apiKey: string; isProbe: boolean }

async function resolveChannels(vendor: VendorId, model?: string): Promise<UpstreamChannel[]> {
  const redisChannels = await getChannelsForProxy(vendor).catch(() => []);
  if (redisChannels.length > 0) return redisChannels;

  // Env var fallback — no circuit-breaker tracking for these
  if (vendor === 'yunwu' && model?.startsWith('gemini')) {
    const geminiKeys = (process.env.YUNWU_MASTER_KEY_GEMINI ?? '')
      .split(',').map(k => k.trim()).filter(Boolean);
    if (geminiKeys.length > 0) return geminiKeys.map(k => ({ id: null, apiKey: k, isProbe: false }));
  }
  return (process.env[`${vendor.toUpperCase()}_MASTER_KEY`] ?? '')
    .split(',').map(k => k.trim()).filter(Boolean)
    .map(k => ({ id: null, apiKey: k, isProbe: false }));
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

          if (vendor === 'claude') {
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

  // Early check: at least one channel/key must exist for this vendor
  const defaultChannels = await resolveChannels(vendor);
  if (defaultChannels.length === 0) {
    console.error(`No master keys configured for vendor ${vendor} (Redis channels or env var)`);
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

    // Per-key RPM limit check
    const rpmLimit = (keyData as { rpmLimit?: number | null }).rpmLimit;
    if (rpmLimit != null && rpmLimit > 0) {
      const rpm = await checkRpmLimit(subKey, rpmLimit);
      if (!rpm.ok) {
        return NextResponse.json(
          { error: 'Key RPM limit exceeded', limit: rpm.limit, current: rpm.count },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }

    // Per-key TPM pre-flight check (based on accumulated usage this minute)
    const tpmLimit = (keyData as { tpmLimit?: number | null }).tpmLimit;
    if (tpmLimit != null && tpmLimit > 0) {
      const currentTpm = await getTpmUsage(subKey);
      if (currentTpm >= tpmLimit) {
        return NextResponse.json(
          { error: 'Key TPM limit exceeded', limit: tpmLimit, current: currentTpm },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }

    // USD budget check: if key has a per-key spend cap, enforce it
    const budgetUsd = (keyData as { budgetUsd?: number | null }).budgetUsd;
    if (budgetUsd != null && budgetUsd > 0) {
      const spentUsd = kd.costUsd ?? 0;
      if (spentUsd >= budgetUsd) {
        const ts = new Date().toISOString();
        void logEvent({ type: 'quota.exceeded', subKey: subKey.slice(-8), ...kMeta, timestamp: ts });
        notify({ event: 'quota.exceeded', subKey: subKey.slice(-8), ...kMeta, detail: `$${spentUsd.toFixed(4)}/$${budgetUsd} USD budget`, timestamp: ts });
        return NextResponse.json({ error: 'Key USD budget exceeded' }, { status: 429 });
      }
    }

    // Resolve key owner for post-call billing (negative balance allowed)
    const keyUserId = (keyData as { userId?: string }).userId;

    let rawBody = await req.text();
    let model = safeModelFromBody(rawBody);
    const streaming = isStreaming(rawBody);

    // Enforce key's bound model: if key has a model configured, always use it
    const keyModel = (keyData as { model?: string }).model;
    if (keyModel) {
      if (model && model !== keyModel) {
        return NextResponse.json(
          { error: `This key is bound to model "${keyModel}", cannot use "${model}"` },
          { status: 403 },
        );
      }
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

    // Resolve channels (Redis with circuit-breaker, or env var fallback)
    const channels = await resolveChannels(vendor, model);
    let response: Response | null = null;
    let usedChannel: UpstreamChannel | null = null;
    const requestStart = Date.now();

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const upstream = buildUpstreamRequest(vendor, ch.apiKey, rawBody);
      if (i === 0) {
        console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} model=${model ?? '?'} stream=${streaming} channel=${ch.id ?? 'env'}${ch.isProbe ? ' (probe)' : ''}`);
      }

      const res = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: upstream.body,
      });

      if (res.ok) {
        response = res;
        usedChannel = ch;
        // Record success — resets fail count and closes circuit if open
        if (ch.id) void recordChannelSuccess(ch.id);
        break;
      }

      const retryable = res.status === 401 || res.status === 429 || res.status >= 500;
      const errorDesc = `HTTP ${res.status}`;

      // Record failure — may open circuit breaker
      if (ch.id) {
        void recordChannelFailure(ch.id, errorDesc);
      }

      if (retryable && i < channels.length - 1) {
        console.warn(`[proxy] ${vendor} channel=${ch.id ?? 'env'} ✗ ${errorDesc}, trying next`);
        continue;
      }

      // Last channel or non-retryable error
      console.warn(`[proxy] ${vendor} key=${subKey.slice(-8)} all channels failed, last: ${errorDesc}`);
      const errData = await res.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(errData, { status: res.status });
    }

    if (!response || !usedChannel) {
      return NextResponse.json({ error: 'All upstream channels failed' }, { status: 502 });
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
        // TPM accounting
        if (tpmLimit != null && tpmLimit > 0 && inputTokens + outputTokens > 0) {
          void checkTpmLimit(subKey, tpmLimit, inputTokens + outputTokens);
        }
        // Structured usage log
        void writeUsageLog({
          subKey: subKey.slice(-8),
          userId: keyUserId ?? undefined,
          vendor,
          model: effectiveModel ?? undefined,
          inputTokens,
          outputTokens,
          costUsd: costInc,
          latencyMs: Date.now() - requestStart,
          status: 'success',
          timestamp: new Date().toISOString(),
        });
        // Deduct from user balance
        if (keyUserId && costInc > 0) {
          void deductBalance(keyUserId, costInc);
        }
      });

      const headers = new Headers();
      headers.set('Content-Type', response.headers.get('Content-Type') ?? 'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      return new Response(clientStream, { status: response.status, headers });
    }

    // Non-streaming: parse JSON + update tokens/cost
    let data: Record<string, unknown>;
    try {
      data = await response.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Upstream returned non-JSON response' }, { status: 502 });
    }
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
    // TPM accounting
    if (tpmLimit != null && tpmLimit > 0 && inputInc + outputInc > 0) {
      void checkTpmLimit(subKey, tpmLimit, inputInc + outputInc);
    }
    // Structured usage log
    void writeUsageLog({
      subKey: subKey.slice(-8),
      userId: keyUserId ?? undefined,
      vendor,
      model: effectiveModel ?? undefined,
      inputTokens: inputInc,
      outputTokens: outputInc,
      costUsd: costInc,
      latencyMs: Date.now() - requestStart,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
    // Deduct from user balance
    if (keyUserId && costInc > 0) {
      void deductBalance(keyUserId, costInc);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[proxy] ${vendor} key=${subKey.slice(-8)} fatal`, error);
    return NextResponse.json({ error: 'Proxy Error' }, { status: 500 });
  }
}
