import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isValidVendor, VENDOR_CONFIG } from '@/lib/vendors';
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
import { applySubKeyDelta } from '@/lib/subkey-mutate';
import { bedrockConverseToOpenAI, buildBedrockConverseRequest, openAICompletionToSSE } from '@/lib/bedrock';
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
  return (process.env[VENDOR_CONFIG[vendor].envKey] ?? '')
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

function getSubKey(req: NextRequest): string | null {
  const xApiKey = req.headers.get('x-api-key')?.trim();
  if (xApiKey) return xApiKey;

  const auth = req.headers.get('authorization')?.trim();
  const match = auth?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getSourcePath(req: NextRequest): string | undefined {
  const referer = req.headers.get('referer');
  if (!referer) return undefined;
  try {
    return new URL(referer).pathname || undefined;
  } catch {
    return undefined;
  }
}

function normalizeModelForVendor(vendor: VendorId, model: string | undefined): string | undefined {
  if (!model || vendor !== 'amazon') return model;
  const amazonAliases: Record<string, string> = {
    'anthropic.claude-3-5-haiku-20241022-v1:0': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    'us.anthropic.claude-3-5-haiku-20241022-v1:0': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    'us.anthropic.claude-sonnet-4-20250514-v1:0': 'us.anthropic.claude-sonnet-4-6',
  };
  return amazonAliases[model] ?? model;
}

function setBodyModel(rawBody: string, model: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    parsed.model = model;
    return JSON.stringify(parsed);
  } catch {
    return rawBody;
  }
}

// Parse SSE stream to extract token usage (supports Anthropic and OpenAI-compatible formats)
async function extractTokensFromSSE(
  stream: ReadableStream,
  isAnthropicFormat: boolean,
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

          if (isAnthropicFormat) {
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
          } else {
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
  const { vendor, path: pathSegments } = await context.params;
  const incomingPath = pathSegments?.join('/') ?? '';
  const sourcePath = getSourcePath(req);
  const requestPath = req.nextUrl.pathname;
  const requestStart = Date.now();

  if (!isValidVendor(vendor)) {
    return NextResponse.json({ error: 'Unknown vendor' }, { status: 404 });
  }

  const subKey = getSubKey(req);

  if (!subKey) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 401 });
  }

  // Early check: at least one channel/key must exist for this vendor
  const defaultChannels = await resolveChannels(vendor);
  if (defaultChannels.length === 0) {
    console.error(`No master keys configured for vendor ${vendor} (Redis channels or env var)`);
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
  }

  try {
    const keyDataStr = await redis.hget('vault:subkeys', subKey);
    const keyData = parseKeyRecord(keyDataStr);

    const keyUserId = (keyData as { userId?: string } | null)?.userId;
    const kMeta = keyData
      ? {
          vendor: (keyData as { vendor: string }).vendor,
          group: (keyData as { group: string }).group,
          name: (keyData as { name: string }).name,
        }
      : { vendor, group: '', name: '' };
    let model: string | undefined;
    let streaming = false;

    const recordUsageLog = (params: {
      status: 'success' | 'error';
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      latencyMs?: number;
      errorCode?: number;
    }) => {
      void writeUsageLog({
        subKey: subKey.slice(-8),
        userId: keyUserId ?? undefined,
        vendor,
        model: params.model ?? model,
        tokenName: kMeta.name || undefined,
        group: kMeta.group || undefined,
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        costUsd: params.costUsd ?? 0,
        latencyMs: params.latencyMs ?? (Date.now() - requestStart),
        stream: streaming,
        status: params.status,
        errorCode: params.errorCode,
        requestPath,
        sourcePath,
        timestamp: new Date().toISOString(),
      });
    };

    if (!keyData || (keyData as { vendor?: string }).vendor !== vendor) {
      recordUsageLog({ status: 'error', errorCode: 403 });
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

    if (kd.expiresAt && new Date(kd.expiresAt) < new Date()) {
      const ts = new Date().toISOString();
      void logEvent({ type: 'key.expired', subKey: subKey.slice(-8), ...kMeta, timestamp: ts });
      notify({ event: 'key.expired', subKey: subKey.slice(-8), ...kMeta, detail: `expired at ${kd.expiresAt}`, timestamp: ts });
      recordUsageLog({ status: 'error', errorCode: 403 });
      return NextResponse.json({ error: 'Key expired' }, { status: 403 });
    }

    // Rate limit check: sliding window per sub-key
    const rl = await proxyRateLimit.limit(subKey);
    if (!rl.success) {
      const retryAfter = Math.ceil((rl.reset - Date.now()) / 1000);
      recordUsageLog({ status: 'error', errorCode: 429 });
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
        recordUsageLog({ status: 'error', errorCode: 429 });
        return NextResponse.json({ error: 'Quota exceeded' }, { status: 429 });
      }
    }

    // Per-key RPM limit check
    const rpmLimit = (keyData as { rpmLimit?: number | null }).rpmLimit;
    if (rpmLimit != null && rpmLimit > 0) {
      const rpm = await checkRpmLimit(subKey, rpmLimit);
      if (!rpm.ok) {
        recordUsageLog({ status: 'error', errorCode: 429 });
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
        recordUsageLog({ status: 'error', errorCode: 429 });
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
        recordUsageLog({ status: 'error', errorCode: 429 });
        return NextResponse.json({ error: 'Key USD budget exceeded' }, { status: 429 });
      }
    }

    // Pre-flight balance gate: allow a small grace overdraft, then refuse.
    // Without this, a $0 user could spam premium models on the master key indefinitely.
    const NEGATIVE_BALANCE_GRACE_USD = 1;
    if (keyUserId) {
      const currentBalance = await getBalance(keyUserId);
      if (currentBalance < -NEGATIVE_BALANCE_GRACE_USD) {
        recordUsageLog({ status: 'error', errorCode: 402 });
        return NextResponse.json(
          { error: 'Insufficient balance', balance: currentBalance },
          { status: 402 },
        );
      }
    }

    let rawBody = await req.text();
    model = normalizeModelForVendor(vendor, safeModelFromBody(rawBody));
    if (model && model !== safeModelFromBody(rawBody)) {
      rawBody = setBodyModel(rawBody, model);
    }
    streaming = isStreaming(rawBody);

    // Enforce key's bound model: if key has a model configured, always use it
    const storedKeyModel = (keyData as { model?: string }).model;
    const keyModel = normalizeModelForVendor(vendor, storedKeyModel);
    if (keyModel) {
      if (model && model !== keyModel) {
        recordUsageLog({ status: 'error', errorCode: 403, model });
        return NextResponse.json(
          { error: `This key is bound to model "${keyModel}", cannot use "${model}"` },
          { status: 403 },
        );
      }
      rawBody = setBodyModel(rawBody, keyModel);
      model = keyModel;
    }

    // Determine actual format from incoming path (auto-routing)
    const isAnthropicFormat = incomingPath === 'v1/messages' ||
      (incomingPath === '' && VENDOR_CONFIG[vendor].authStyle === 'x-api-key');

    // Inject stream_options for OpenAI-compatible requests so usage is included in final SSE chunk
    if (streaming && !isAnthropicFormat) {
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

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (i === 0) {
        console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} model=${model ?? '?'} stream=${streaming} channel=${ch.id ?? 'env'}${ch.isProbe ? ' (probe)' : ''}`);
      }

      let res: Response;
      if (vendor === 'amazon') {
        try {
          const upstream = buildBedrockConverseRequest(ch.apiKey, rawBody, VENDOR_CONFIG.amazon.baseUrl);
          const bedrockRes = await fetch(upstream.url, {
            method: 'POST',
            headers: upstream.headers,
            body: upstream.body,
          });

          if (bedrockRes.ok) {
            const bedrockData = await bedrockRes.json() as Record<string, unknown>;
            const openAIData = bedrockConverseToOpenAI(bedrockData, upstream.model);
            res = upstream.streamRequested
              ? openAICompletionToSSE(openAIData)
              : NextResponse.json(openAIData);
          } else {
            res = bedrockRes;
          }
        } catch (error) {
          console.error(`[proxy] ${vendor} failed to build Converse request`, error);
          recordUsageLog({ status: 'error', errorCode: 400, model });
          return NextResponse.json({ error: 'Invalid Bedrock request' }, { status: 400 });
        }
      } else {
        const upstream = buildUpstreamRequest(vendor, ch.apiKey, rawBody, incomingPath || undefined);
        res = await fetch(upstream.url, {
          method: 'POST',
          headers: upstream.headers,
          body: upstream.body,
        });
      }

      if (res.ok) {
        response = res;
        usedChannel = ch;
        // Record success — resets fail count and closes circuit if open
        if (ch.id) void recordChannelSuccess(ch.id);
        break;
      }

      const retryable =
        res.status === 401 ||
        res.status === 429 ||
        res.status >= 500 ||
        (vendor === 'amazon' && (res.status === 403 || res.status === 404));
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
      recordUsageLog({ status: 'error', errorCode: res.status, model });
      return NextResponse.json(errData, { status: res.status });
    }

    if (!response || !usedChannel) {
      recordUsageLog({ status: 'error', errorCode: 502, model });
      return NextResponse.json({ error: 'All upstream channels failed' }, { status: 502 });
    }

    // Increment call count + lastUsed (atomic, fire-and-forget)
    const now = new Date().toISOString();
    void applySubKeyDelta(subKey, { usageInc: 1, lastUsed: now });

    const today = now.slice(0, 10);
    void redis.incr(`vault:daily:calls:${today}`)
      .then(() => redis.expire(`vault:daily:calls:${today}`, 35 * 24 * 3600))
      .catch((err) => console.warn('[analytics] daily counter failed', err));

    // Streaming: pipe SSE through, parse tokens in background
    if (streaming && response.body) {
      const [clientStream, parseStream] = response.body.tee();

      void extractTokensFromSSE(parseStream, isAnthropicFormat).then(async ({ inputTokens, outputTokens, realModel }) => {
        if (inputTokens === 0 && outputTokens === 0) return;
        const effectiveModel = realModel ?? model;
        const costInc = estimateVendorCostUsd(vendor, effectiveModel, { inputTokens, outputTokens });
        console.log(`[proxy] ${vendor} key=${subKey.slice(-8)} ✓ stream model=${effectiveModel ?? '?'} in=${inputTokens} out=${outputTokens} cost=$${costInc.toFixed(6)}`);
        void logEvent({ type: 'proxy.success', subKey: subKey.slice(-8), ...kMeta, timestamp: new Date().toISOString(), model: effectiveModel ?? undefined, inputTokens, outputTokens });
        void applySubKeyDelta(subKey, {
          inputTokensInc: inputTokens,
          outputTokensInc: outputTokens,
          costUsdInc: costInc,
        });
        void recordDailyKeyUsage(subKey, today, { calls: 1, inputTokens, outputTokens, costUsd: costInc });
        // TPM accounting
        if (tpmLimit != null && tpmLimit > 0 && inputTokens + outputTokens > 0) {
          void checkTpmLimit(subKey, tpmLimit, inputTokens + outputTokens);
        }
        // Structured usage log
        recordUsageLog({
          status: 'success',
          model: effectiveModel ?? undefined,
          inputTokens,
          outputTokens,
          costUsd: costInc,
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

    void applySubKeyDelta(subKey, {
      inputTokensInc: inputInc,
      outputTokensInc: outputInc,
      costUsdInc: costInc,
    });
    void recordDailyKeyUsage(subKey, today, { calls: 1, inputTokens: inputInc, outputTokens: outputInc, costUsd: costInc });
    // TPM accounting
    if (tpmLimit != null && tpmLimit > 0 && inputInc + outputInc > 0) {
      void checkTpmLimit(subKey, tpmLimit, inputInc + outputInc);
    }
    // Structured usage log
    recordUsageLog({
      status: 'success',
      model: effectiveModel ?? undefined,
      inputTokens: inputInc,
      outputTokens: outputInc,
      costUsd: costInc,
    });
    // Deduct from user balance
    if (keyUserId && costInc > 0) {
      void deductBalance(keyUserId, costInc);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`[proxy] ${vendor} key=${subKey.slice(-8)} fatal`, error);
    void writeUsageLog({
      subKey: subKey.slice(-8),
      vendor,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - requestStart,
      status: 'error',
      errorCode: 500,
      requestPath,
      sourcePath,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Proxy Error' }, { status: 500 });
  }
}
