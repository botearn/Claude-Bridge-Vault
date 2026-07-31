import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { redis } from '@/lib/redis';
import { isValidVendor, VENDOR_CONFIG } from '@/lib/vendors';
import { buildUpstreamRequest } from '@/lib/proxy';
import {
  calculateUsageCostNanoUsd,
  constrainBotEarnRequestBody,
  estimateMaxCostNanoUsd,
  extractTokenUsage,
  estimateVendorCostUsd,
  getExplicitModelPrice,
  safeModelFromBody,
  type TokenUsage,
} from '@/lib/billing';
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
import { botEarnStorageKey } from '@/lib/subkey-storage';
import { catalogModelId, findCatalogModel } from '@/lib/model-catalog';
import { isModelProbePassed } from '@/lib/model-probes';
import {
  BotEarnBillingError,
  finalizeBotEarnBilling,
  queueUncertainBotEarnReserveRelease,
  reserveBotEarnBalance,
  type BotEarnSettleBody,
} from '@/lib/botearn-billing';

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
): Promise<TokenUsage & { realModel?: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
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
              if (usage) {
                inputTokens = usage.input_tokens ?? 0;
                cachedInputTokens = usage.cache_read_input_tokens ?? 0;
                cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
                outputTokens = usage.output_tokens ?? 0;
              }
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
              const promptDetails = usage.prompt_tokens_details as unknown as Record<string, number> | undefined;
              const completionDetails = usage.completion_tokens_details as unknown as Record<string, number> | undefined;
              if (typeof promptDetails?.cached_tokens === 'number') {
                cachedInputTokens = promptDetails.cached_tokens;
                inputTokens = Math.max(inputTokens - cachedInputTokens, 0);
              }
              if (typeof completionDetails?.reasoning_tokens === 'number') {
                reasoningTokens = completionDetails.reasoning_tokens;
              }
            }
          }
        } catch { /* ignore malformed lines */ }
      }
    }
  } catch { /* ignore stream errors */ } finally {
    reader.releaseLock();
  }
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    realModel,
  };
}

interface BotEarnRequestContext {
  requestId: string;
  priceSnapshotId: string;
  requestedModelId: string;
  price: NonNullable<ReturnType<typeof getExplicitModelPrice>>;
}

function unknownUsageBody(context: BotEarnRequestContext): BotEarnSettleBody {
  return {
    request_id: context.requestId,
    price_snapshot_id: context.priceSnapshotId,
    actual_model_id: null,
    actual_cost_nano_usd: null,
    input_tokens: null,
    cached_input_tokens: null,
    cache_write_tokens: null,
    output_tokens: null,
    reasoning_tokens: null,
    usage_status: 'unknown',
  };
}

function authoritativeUsageBody(
  context: BotEarnRequestContext,
  actualModelId: string,
  usage: TokenUsage,
): BotEarnSettleBody {
  return {
    request_id: context.requestId,
    price_snapshot_id: context.priceSnapshotId,
    actual_model_id: actualModelId,
    actual_cost_nano_usd: calculateUsageCostNanoUsd(context.price, usage).toString(),
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    output_tokens: usage.outputTokens,
    reasoning_tokens: usage.reasoningTokens,
    usage_status: 'authoritative',
  };
}

async function finalizeWithoutMaskingProviderResponse(
  context: BotEarnRequestContext,
  body: BotEarnSettleBody,
): Promise<void> {
  try {
    await finalizeBotEarnBilling('settle', body);
  } catch (error) {
    console.error('BotEarn billing finalization queued for reconciliation', {
      request_id: context.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function releaseWithoutMaskingValidationError(
  context: BotEarnRequestContext,
  reason: string,
): Promise<void> {
  try {
    await finalizeBotEarnBilling('release', {
      request_id: context.requestId,
      reason,
    });
  } catch (error) {
    console.error('BotEarn billing release queued for reconciliation', {
      request_id: context.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { vendor, path: pathSegments } = await context.params;
  const incomingPath = pathSegments?.join('/') ?? '';
  const sourcePath = getSourcePath(req);
  const requestPath = req.nextUrl.pathname;
  const requestStart = Date.now();
  let botEarnContext: BotEarnRequestContext | null = null;

  if (!isValidVendor(vendor)) {
    return NextResponse.json({ error: 'Unknown vendor' }, { status: 404 });
  }

  const subKey = getSubKey(req);

  if (!subKey) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 401 });
  }
  let keyLogId = botEarnStorageKey(subKey).slice(-8);

  // Early check: at least one channel/key must exist for this vendor
  const defaultChannels = await resolveChannels(vendor);
  if (defaultChannels.length === 0) {
    console.error(`No master keys configured for vendor ${vendor} (Redis channels or env var)`);
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 });
  }

  try {
    const hashedStorageKey = botEarnStorageKey(subKey);
    const hashedKeyData = await redis.hget('vault:subkeys', hashedStorageKey);
    const keyStorageKey = hashedKeyData ? hashedStorageKey : subKey;
    const keyDataStr = hashedKeyData ?? await redis.hget('vault:subkeys', subKey);
    const keyData = parseKeyRecord(keyDataStr);
    const isBotEarnKey = (keyData as { billingMode?: string } | null)?.billingMode
      === 'botearn_ai_balance';
    const keyMetricId = isBotEarnKey ? keyStorageKey : subKey;
    keyLogId = isBotEarnKey ? keyStorageKey.slice(-8) : subKey.slice(-8);

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
        subKey: keyLogId,
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

    if (!keyData || (!isBotEarnKey && (keyData as { vendor?: string }).vendor !== vendor)) {
      recordUsageLog({ status: 'error', errorCode: 403 });
      return NextResponse.json({ error: 'Invalid or mismatched key' }, { status: 403 });
    }
    if (isBotEarnKey && (keyData as { status?: string }).status !== 'active') {
      recordUsageLog({ status: 'error', errorCode: 403 });
      return NextResponse.json({ error: 'Key is not active' }, { status: 403 });
    }

    const kd = keyData as {
      expiresAt?: string | null;
      totalQuota?: number | null;
      usage?: number;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      billingAccountId?: string;
      externalKeyId?: string;
      allowedModels?: string[];
      policyVersion?: number;
    };

    if (kd.expiresAt && new Date(kd.expiresAt) < new Date()) {
      const ts = new Date().toISOString();
      void logEvent({ type: 'key.expired', subKey: keyLogId, ...kMeta, timestamp: ts });
      notify({ event: 'key.expired', subKey: keyLogId, ...kMeta, detail: `expired at ${kd.expiresAt}`, timestamp: ts });
      recordUsageLog({ status: 'error', errorCode: 403 });
      return NextResponse.json({ error: 'Key expired' }, { status: 403 });
    }

    // Rate limit check: sliding window per sub-key
    const rl = await proxyRateLimit.limit(keyMetricId);
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
        void logEvent({ type: 'quota.exceeded', subKey: keyLogId, ...kMeta, timestamp: ts });
        notify({ event: 'quota.exceeded', subKey: keyLogId, ...kMeta, detail: `${usedTokens}/${kd.totalQuota} tokens`, timestamp: ts });
        recordUsageLog({ status: 'error', errorCode: 429 });
        return NextResponse.json({ error: 'Quota exceeded' }, { status: 429 });
      }
    }

    // Per-key RPM limit check
    const rpmLimit = (keyData as { rpmLimit?: number | null }).rpmLimit;
    if (rpmLimit != null && rpmLimit > 0) {
      const rpm = await checkRpmLimit(keyMetricId, rpmLimit);
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
      const currentTpm = await getTpmUsage(keyMetricId);
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
        void logEvent({ type: 'quota.exceeded', subKey: keyLogId, ...kMeta, timestamp: ts });
        notify({ event: 'quota.exceeded', subKey: keyLogId, ...kMeta, detail: `$${spentUsd.toFixed(4)}/$${budgetUsd} USD budget`, timestamp: ts });
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

    if (isBotEarnKey) {
      const catalogModel = findCatalogModel(vendor, model);
      const requestedModelId = catalogModelId(vendor, model ?? '');
      const allowedModels = kd.allowedModels ?? [];
      const price = model ? getExplicitModelPrice(vendor, model) : null;
      if (!catalogModel || !price) {
        recordUsageLog({ status: 'error', errorCode: 400, model });
        return NextResponse.json(
          { error: 'Model is not available for balance billing', code: 'AI_MODEL_NOT_AVAILABLE' },
          { status: 400 },
        );
      }
      if (!await isModelProbePassed(requestedModelId)) {
        recordUsageLog({ status: 'error', errorCode: 503, model });
        return NextResponse.json(
          { error: 'Model health probe is unavailable', code: 'AI_MODEL_PROBE_UNAVAILABLE' },
          { status: 503 },
        );
      }
      if (!allowedModels.includes(requestedModelId)) {
        recordUsageLog({ status: 'error', errorCode: 403, model });
        return NextResponse.json(
          { error: 'Model is not allowed for this key', code: 'AI_MODEL_NOT_ALLOWED' },
          { status: 403 },
        );
      }
      if (!kd.billingAccountId || !kd.externalKeyId || !kd.policyVersion) {
        recordUsageLog({ status: 'error', errorCode: 403, model });
        return NextResponse.json(
          { error: 'Balance billing key is incomplete', code: 'AI_KEY_POLICY_INVALID' },
          { status: 403 },
        );
      }
      const constrained = constrainBotEarnRequestBody(rawBody);
      if (constrained.errorCode) {
        recordUsageLog({ status: 'error', errorCode: 400, model });
        return NextResponse.json(
          { error: 'Request cannot be safely pre-authorized', code: constrained.errorCode },
          { status: 400 },
        );
      }
      rawBody = constrained.body;

      const requestId = randomUUID();
      const maxCost = estimateMaxCostNanoUsd(rawBody, price);
      const reservedContext: BotEarnRequestContext = {
        requestId,
        priceSnapshotId: catalogModel.pricing.snapshotId,
        requestedModelId,
        price,
      };
      try {
        await reserveBotEarnBalance({
          request_id: requestId,
          billing_account_id: kd.billingAccountId,
          external_key_id: kd.externalKeyId,
          model_id: requestedModelId,
          price_snapshot_id: catalogModel.pricing.snapshotId,
          estimation_policy_version: catalogModel.pricing.estimationPolicyVersion,
          max_cost_nano_usd: maxCost.toString(),
        });
      } catch (error) {
        const billingError = error instanceof BotEarnBillingError ? error : null;
        if (!billingError || billingError.status >= 500) {
          await queueUncertainBotEarnReserveRelease(requestId);
        }
        const status = billingError && billingError.status >= 400 && billingError.status < 500
          ? billingError.status
          : 503;
        const code = billingError?.code ?? 'BOTEARN_BILLING_UNAVAILABLE';
        recordUsageLog({ status: 'error', errorCode: status, model });
        return NextResponse.json(
          { error: 'AI balance authorization failed', code },
          { status },
        );
      }
      botEarnContext = reservedContext;
    }

    // Resolve channels (Redis with circuit-breaker, or env var fallback)
    const channels = await resolveChannels(vendor, model);
    let response: Response | null = null;
    let usedChannel: UpstreamChannel | null = null;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (i === 0) {
        console.log(`[proxy] ${vendor} key=${keyLogId} model=${model ?? '?'} stream=${streaming} channel=${ch.id ?? 'env'}${ch.isProbe ? ' (probe)' : ''}`);
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
          if (botEarnContext) {
            await releaseWithoutMaskingValidationError(botEarnContext, 'REQUEST_BUILD_FAILED');
            botEarnContext = null;
          }
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
      console.warn(`[proxy] ${vendor} key=${keyLogId} all channels failed, last: ${errorDesc}`);
      const errData = await res.json().catch(() => ({ error: 'Upstream error' }));
      if (botEarnContext) {
        await finalizeWithoutMaskingProviderResponse(
          botEarnContext,
          unknownUsageBody(botEarnContext),
        );
        botEarnContext = null;
      }
      recordUsageLog({ status: 'error', errorCode: res.status, model });
      return NextResponse.json(errData, { status: res.status });
    }

    if (!response || !usedChannel) {
      if (botEarnContext) {
        await finalizeWithoutMaskingProviderResponse(
          botEarnContext,
          unknownUsageBody(botEarnContext),
        );
        botEarnContext = null;
      }
      recordUsageLog({ status: 'error', errorCode: 502, model });
      return NextResponse.json({ error: 'All upstream channels failed' }, { status: 502 });
    }

    // Increment call count + lastUsed (atomic, fire-and-forget)
    const now = new Date().toISOString();
    void applySubKeyDelta(keyStorageKey, { usageInc: 1, lastUsed: now });

    const today = now.slice(0, 10);
    void redis.incr(`vault:daily:calls:${today}`)
      .then(() => redis.expire(`vault:daily:calls:${today}`, 35 * 24 * 3600))
      .catch((err) => console.warn('[analytics] daily counter failed', err));

    // Streaming: pipe SSE through, parse tokens in background
    if (streaming && response.body) {
      const [clientStream, parseStream] = response.body.tee();
      const streamingBillingContext = botEarnContext;
      botEarnContext = null;

      after(async () => {
        const usage = await extractTokensFromSSE(parseStream, isAnthropicFormat);
        const {
          inputTokens,
          outputTokens,
          realModel,
        } = usage;
        const effectiveModel = realModel ?? model;
        if (streamingBillingContext) {
          const hasUsage = inputTokens > 0
            || usage.cachedInputTokens > 0
            || usage.cacheWriteTokens > 0
            || outputTokens > 0;
          await finalizeWithoutMaskingProviderResponse(
            streamingBillingContext,
            hasUsage
              ? authoritativeUsageBody(
                  streamingBillingContext,
                  effectiveModel
                    ? catalogModelId(vendor, effectiveModel)
                    : streamingBillingContext.requestedModelId,
                  usage,
                )
              : unknownUsageBody(streamingBillingContext),
          );
        }
        if (inputTokens === 0 && outputTokens === 0) return;
        const costInc = estimateVendorCostUsd(vendor, effectiveModel, usage);
        console.log(`[proxy] ${vendor} key=${keyLogId} ✓ stream model=${effectiveModel ?? '?'} in=${inputTokens} out=${outputTokens} cost=$${costInc.toFixed(6)}`);
        void logEvent({ type: 'proxy.success', subKey: keyLogId, ...kMeta, timestamp: new Date().toISOString(), model: effectiveModel ?? undefined, inputTokens, outputTokens });
        void applySubKeyDelta(keyStorageKey, {
          inputTokensInc: inputTokens,
          outputTokensInc: outputTokens,
          costUsdInc: costInc,
        });
        void recordDailyKeyUsage(keyMetricId, today, { calls: 1, inputTokens, outputTokens, costUsd: costInc });
        // TPM accounting
        if (tpmLimit != null && tpmLimit > 0 && inputTokens + outputTokens > 0) {
          void checkTpmLimit(keyMetricId, tpmLimit, inputTokens + outputTokens);
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
      if (botEarnContext) {
        await finalizeWithoutMaskingProviderResponse(
          botEarnContext,
          unknownUsageBody(botEarnContext),
        );
        botEarnContext = null;
      }
      return NextResponse.json({ error: 'Upstream returned non-JSON response' }, { status: 502 });
    }
    const realModel = typeof data.model === 'string' ? data.model : undefined;
    const effectiveModel = realModel ?? model;
    const tokenUsage = extractTokenUsage(vendor, data);
    const inputInc = tokenUsage?.inputTokens ?? 0;
    const outputInc = tokenUsage?.outputTokens ?? 0;
    const costInc = tokenUsage ? estimateVendorCostUsd(vendor, effectiveModel, tokenUsage) : 0;
    if (botEarnContext) {
      await finalizeWithoutMaskingProviderResponse(
        botEarnContext,
        tokenUsage
          ? authoritativeUsageBody(
              botEarnContext,
              effectiveModel
                ? catalogModelId(vendor, effectiveModel)
                : botEarnContext.requestedModelId,
              tokenUsage,
            )
          : unknownUsageBody(botEarnContext),
      );
      botEarnContext = null;
    }
    console.log(`[proxy] ${vendor} key=${keyLogId} ✓ model=${effectiveModel ?? '?'} in=${inputInc} out=${outputInc} cost=$${costInc.toFixed(6)}`);
    void logEvent({ type: 'proxy.success', subKey: keyLogId, ...kMeta, timestamp: new Date().toISOString(), model: effectiveModel ?? undefined, inputTokens: inputInc, outputTokens: outputInc });

    void applySubKeyDelta(keyStorageKey, {
      inputTokensInc: inputInc,
      outputTokensInc: outputInc,
      costUsdInc: costInc,
    });
    void recordDailyKeyUsage(keyMetricId, today, { calls: 1, inputTokens: inputInc, outputTokens: outputInc, costUsd: costInc });
    // TPM accounting
    if (tpmLimit != null && tpmLimit > 0 && inputInc + outputInc > 0) {
      void checkTpmLimit(keyMetricId, tpmLimit, inputInc + outputInc);
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
    if (botEarnContext) {
      await finalizeWithoutMaskingProviderResponse(
        botEarnContext,
        unknownUsageBody(botEarnContext),
      );
      botEarnContext = null;
    }
    console.error(`[proxy] ${vendor} key=${keyLogId} fatal`, error);
    void writeUsageLog({
      subKey: keyLogId,
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
