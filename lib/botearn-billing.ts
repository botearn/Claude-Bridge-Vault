import { randomUUID } from 'crypto';
import { createBotEarnHeaders } from './botearn-auth';
import { redis } from './redis';

const PENDING_HASH = 'vault:botearn:billing-pending';
const RESERVATION_LEASE_MS = 15 * 60 * 1000;

export type BotEarnBillingAction = 'reserve' | 'settle' | 'release';

export interface BotEarnReserveBody {
  request_id: string;
  billing_account_id: string;
  external_key_id: string;
  model_id: string;
  price_snapshot_id: string;
  estimation_policy_version: string;
  max_cost_nano_usd: string;
}

export interface BotEarnSettleBody {
  request_id: string;
  price_snapshot_id: string;
  actual_model_id: string | null;
  actual_cost_nano_usd: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  usage_status: 'authoritative' | 'unknown';
}

export interface BotEarnReleaseBody {
  request_id: string;
  reason: string;
}

type BillingBody = BotEarnReserveBody | BotEarnSettleBody | BotEarnReleaseBody;

export interface PendingBillingOperation {
  action: Exclude<BotEarnBillingAction, 'reserve'>;
  body: BotEarnSettleBody | BotEarnReleaseBody;
  headerRequestId: string;
  retryCount: number;
  createdAt: string;
  lastError: string;
}

export class BotEarnBillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BotEarnBillingError';
  }
}

function endpoint(action: BotEarnBillingAction): URL {
  const raw = process.env.BOTEARN_BILLING_URL;
  if (!raw) throw new BotEarnBillingError(
    'BOTEARN_BILLING_NOT_CONFIGURED',
    'BotEarn billing URL is not configured',
    503,
  );
  const url = new URL(raw);
  url.searchParams.set('action', action);
  return url;
}

async function sendBillingOperation(
  action: BotEarnBillingAction,
  body: BillingBody,
  headerRequestId: string,
): Promise<Record<string, unknown>> {
  const url = endpoint(action);
  const serialized = JSON.stringify(body);
  const path = `${url.pathname}${url.search}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: createBotEarnHeaders('POST', path, headerRequestId, serialized),
    body: serialized,
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof data.code === 'string' ? data.code : 'BOTEARN_BILLING_FAILED';
    const message = typeof data.error === 'string'
      ? data.error
      : `BotEarn billing request failed (${response.status})`;
    throw new BotEarnBillingError(code, message, response.status);
  }
  return data;
}

export async function reserveBotEarnBalance(
  body: BotEarnReserveBody,
): Promise<Record<string, unknown>> {
  return sendBillingOperation('reserve', body, randomUUID());
}

async function queuePending(
  action: Exclude<BotEarnBillingAction, 'reserve'>,
  body: BotEarnSettleBody | BotEarnReleaseBody,
  headerRequestId: string,
  error: unknown,
): Promise<void> {
  const operation: PendingBillingOperation = {
    action,
    body,
    headerRequestId,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message.slice(0, 200) : 'Unknown billing callback error',
  };
  await redis.hset(PENDING_HASH, {
    [`${action}:${body.request_id}`]: JSON.stringify(operation),
  });
}

export async function finalizeBotEarnBilling(
  action: Exclude<BotEarnBillingAction, 'reserve'>,
  body: BotEarnSettleBody | BotEarnReleaseBody,
): Promise<void> {
  const headerRequestId = randomUUID();
  try {
    await sendBillingOperation(action, body, headerRequestId);
    await redis.hdel(PENDING_HASH, `${action}:${body.request_id}`);
  } catch (error) {
    await queuePending(action, body, headerRequestId, error);
    throw error;
  }
}

export async function queueUncertainBotEarnReserveRelease(
  requestId: string,
): Promise<void> {
  await queuePending(
    'release',
    {
      request_id: requestId,
      reason: 'RESERVE_RESPONSE_UNKNOWN',
    },
    randomUUID(),
    new Error('Reserve response was not received'),
  );
}

function parsePending(value: unknown): PendingBillingOperation | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as PendingBillingOperation;
    } catch {
      return null;
    }
  }
  return value as PendingBillingOperation;
}

export async function retryPendingBotEarnBilling(limit = 20): Promise<{
  attempted: number;
  completed: number;
  failed: number;
}> {
  const all = await redis.hgetall<Record<string, string>>(PENDING_HASH);
  const entries = Object.entries(all ?? {}).slice(0, limit);
  let completed = 0;
  let failed = 0;

  for (const [operationKey, raw] of entries) {
    const operation = parsePending(raw);
    if (!operation) {
      await redis.hdel(PENDING_HASH, operationKey);
      continue;
    }
    try {
      await sendBillingOperation(
        operation.action,
        operation.body,
        operation.headerRequestId,
      );
      await redis.hdel(PENDING_HASH, operationKey);
      completed += 1;
    } catch (error) {
      const reservationMissing = operation.action === 'release'
        && error instanceof BotEarnBillingError
        && error.code === 'AI_RESERVATION_NOT_FOUND'
        && Date.now() - Date.parse(operation.createdAt) > RESERVATION_LEASE_MS;
      if (reservationMissing) {
        await redis.hdel(PENDING_HASH, operationKey);
        completed += 1;
        continue;
      }
      const next: PendingBillingOperation = {
        ...operation,
        retryCount: operation.retryCount + 1,
        lastError: error instanceof Error ? error.message.slice(0, 200) : 'Unknown billing callback error',
      };
      await redis.hset(PENDING_HASH, { [operationKey]: JSON.stringify(next) });
      failed += 1;
    }
  }

  return { attempted: entries.length, completed, failed };
}
