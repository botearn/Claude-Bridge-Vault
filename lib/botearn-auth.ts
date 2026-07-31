import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { redis } from './redis';

const CLOCK_SKEW_SECONDS = 300;
const REQUEST_TTL_SECONDS = 600;

export interface BotEarnAuthResult {
  ok: boolean;
  code?: string;
  requestId?: string;
}
function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function canonicalMessage(
  method: string,
  path: string,
  timestamp: string,
  requestId: string,
  body: string,
): string {
  return [
    method.toUpperCase(),
    path,
    timestamp,
    requestId,
    bodyHash(body),
  ].join('\n');
}

function signatureFor(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  requestId: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(canonicalMessage(method, path, timestamp, requestId, body))
    .digest('hex');
}

function signaturesMatch(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function verifyBotEarnRequest(
  req: NextRequest,
  body: string,
): Promise<BotEarnAuthResult> {
  const secret = process.env.VAULT_BILLING_SECRET;
  if (!secret) return { ok: false, code: 'BOTEARN_AUTH_NOT_CONFIGURED' };

  const timestamp = req.headers.get('x-vault-timestamp')?.trim() ?? '';
  const requestId = req.headers.get('x-vault-request-id')?.trim() ?? '';
  const signature = req.headers.get('x-vault-signature')?.trim() ?? '';
  const timestampSeconds = Number(timestamp);

  if (!Number.isInteger(timestampSeconds)
    || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > CLOCK_SKEW_SECONDS) {
    return { ok: false, code: 'BOTEARN_AUTH_TIMESTAMP_INVALID' };
  }
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(requestId)) {
    return { ok: false, code: 'BOTEARN_AUTH_REQUEST_ID_INVALID' };
  }

  const path = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const expected = signatureFor(secret, req.method, path, timestamp, requestId, body);
  if (!signaturesMatch(expected, signature)) {
    return { ok: false, code: 'BOTEARN_AUTH_SIGNATURE_INVALID' };
  }

  const replayKey = `vault:botearn:request:${requestId}`;
  const fingerprint = bodyHash(`${req.method}\n${path}\n${body}`);
  const existing = await redis.get<string>(replayKey);
  if (existing && existing !== fingerprint) {
    return { ok: false, code: 'BOTEARN_AUTH_REPLAY_MISMATCH' };
  }
  if (!existing) {
    await redis.set(replayKey, fingerprint, { nx: true, ex: REQUEST_TTL_SECONDS });
    const raced = await redis.get<string>(replayKey);
    if (raced !== fingerprint) {
      return { ok: false, code: 'BOTEARN_AUTH_REPLAY_MISMATCH' };
    }
  }

  return { ok: true, requestId };
}

export function createBotEarnHeaders(
  method: string,
  path: string,
  requestId: string,
  body: string,
): Record<string, string> {
  const secret = process.env.VAULT_BILLING_SECRET;
  if (!secret) throw new Error('VAULT_BILLING_SECRET is not configured');

  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'Content-Type': 'application/json',
    'x-vault-timestamp': timestamp,
    'x-vault-request-id': requestId,
    'x-vault-signature': signatureFor(secret, method, path, timestamp, requestId, body),
  };
}
