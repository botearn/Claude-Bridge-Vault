import { NextRequest, NextResponse } from 'next/server';
import { verifyBotEarnRequest } from '@/lib/botearn-auth';
import {
  createBotEarnKey,
  loadBotEarnKey,
  revokeBotEarnKey,
  updateBotEarnKey,
} from '@/lib/botearn-keys';
import { getVaultCatalog } from '@/lib/model-catalog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_RE = /^[1-9][0-9]{0,18}$/;

interface KeyPayload {
  name: string;
  externalKeyId: string;
  billingAccountId: string;
  allowedModels: string[];
  totalLimitNanoUsd: string;
  dailyLimitNanoUsd: string;
  policyVersion: number;
  expiresAt: string | null;
}

function fail(code: string, status = 400, params?: Record<string, unknown>) {
  return NextResponse.json({ error: code, code, params }, { status });
}

function parseBody(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: unknown): string | null {
  if (typeof value !== 'string' || !POSITIVE_INTEGER_RE.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > BigInt(0) && parsed <= BigInt('9000000000000000000')
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function validateKeyPayload(body: Record<string, unknown>): KeyPayload | null {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const externalKeyId = typeof body.externalKeyId === 'string' ? body.externalKeyId.trim() : '';
  const billingAccountId = typeof body.billingAccountId === 'string'
    ? body.billingAccountId.trim()
    : '';
  const allowedModels = Array.isArray(body.allowedModels)
    ? Array.from(new Set(body.allowedModels.filter((item): item is string =>
        typeof item === 'string' && item.length > 0 && item.length <= 180)))
    : [];
  const totalLimitNanoUsd = parsePositiveInteger(body.totalLimitNanoUsd);
  const dailyLimitNanoUsd = parsePositiveInteger(body.dailyLimitNanoUsd);
  const policyVersion = typeof body.policyVersion === 'number'
    && Number.isSafeInteger(body.policyVersion)
    && body.policyVersion > 0
    ? body.policyVersion
    : null;
  const expiresAt = body.expiresAt === null
    ? null
    : typeof body.expiresAt === 'string' && Number.isFinite(Date.parse(body.expiresAt))
      ? new Date(body.expiresAt).toISOString()
      : undefined;

  const activeModels = new Set(getVaultCatalog().map(model => model.id));
  if (!name || name.length > 80
    || !UUID_RE.test(externalKeyId)
    || !UUID_RE.test(billingAccountId)
    || allowedModels.length === 0
    || allowedModels.length > 50
    || allowedModels.some(model => !activeModels.has(model))
    || !totalLimitNanoUsd
    || !dailyLimitNanoUsd
    || BigInt(dailyLimitNanoUsd) > BigInt(totalLimitNanoUsd)
    || policyVersion === null
    || expiresAt === undefined
    || (expiresAt !== null && Date.parse(expiresAt) <= Date.now())) {
    return null;
  }

  return {
    name,
    externalKeyId,
    billingAccountId,
    allowedModels,
    totalLimitNanoUsd,
    dailyLimitNanoUsd,
    policyVersion,
    expiresAt,
  };
}

async function authenticate(req: NextRequest, raw: string) {
  const auth = await verifyBotEarnRequest(req, raw);
  return auth.ok ? null : fail(auth.code ?? 'BOTEARN_AUTH_FAILED', 401);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const authError = await authenticate(req, raw);
  if (authError) return authError;
  const body = parseBody(raw);
  const input = body ? validateKeyPayload(body) : null;
  if (!input) return fail('BOTEARN_KEY_INVALID');

  try {
    const result = await createBotEarnKey(input);
    if (!result.created) {
      const existing = await loadBotEarnKey(input.externalKeyId);
      const samePolicy = existing?.billingAccountId === input.billingAccountId
        && existing?.name === input.name
        && existing?.totalLimitNanoUsd === input.totalLimitNanoUsd
        && existing?.dailyLimitNanoUsd === input.dailyLimitNanoUsd
        && existing?.policyVersion === input.policyVersion
        && existing?.expiresAt === input.expiresAt
        && JSON.stringify(existing?.allowedModels ?? []) === JSON.stringify(input.allowedModels);
      return fail(
        samePolicy ? 'BOTEARN_KEY_SECRET_ALREADY_ISSUED' : 'BOTEARN_KEY_ID_CONFLICT',
        409,
        { externalKeyId: input.externalKeyId, keyPrefix: result.keyPrefix },
      );
    }
    return NextResponse.json({
      id: result.externalKeyId,
      externalKeyId: result.externalKeyId,
      keyPrefix: result.keyPrefix,
      baseUrl: `${req.nextUrl.origin}/api/v1`,
      subKey: result.subKey,
      created: true,
    }, { status: 201 });
  } catch (error) {
    console.error('BotEarn key creation failed', error);
    return fail('BOTEARN_KEY_CREATE_FAILED', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const raw = await req.text();
  const authError = await authenticate(req, raw);
  if (authError) return authError;
  const body = parseBody(raw);
  if (!body) return fail('BOTEARN_KEY_INVALID');

  const externalKeyId = typeof body.externalKeyId === 'string' ? body.externalKeyId : '';
  const expectedPolicyVersion = typeof body.expectedPolicyVersion === 'number'
    && Number.isSafeInteger(body.expectedPolicyVersion)
    ? body.expectedPolicyVersion
    : null;
  const nextInput = validateKeyPayload(body);
  if (!nextInput
    || nextInput.externalKeyId !== externalKeyId
    || expectedPolicyVersion === null
    || nextInput.policyVersion <= expectedPolicyVersion) {
    return fail('BOTEARN_KEY_INVALID');
  }

  const existing = await loadBotEarnKey(externalKeyId);
  if (!existing) return fail('BOTEARN_KEY_NOT_FOUND', 404);
  const alreadyApplied = existing.policyVersion === nextInput.policyVersion
    && existing.billingAccountId === nextInput.billingAccountId
    && existing.name === nextInput.name
    && existing.totalLimitNanoUsd === nextInput.totalLimitNanoUsd
    && existing.dailyLimitNanoUsd === nextInput.dailyLimitNanoUsd
    && existing.expiresAt === nextInput.expiresAt
    && JSON.stringify(existing.allowedModels ?? []) === JSON.stringify(nextInput.allowedModels);
  if (alreadyApplied) {
    return NextResponse.json({
      id: externalKeyId,
      externalKeyId,
      keyPrefix: existing.keyPrefix,
      policyVersion: nextInput.policyVersion,
      updated: true,
      idempotent: true,
    });
  }
  const result = await updateBotEarnKey(externalKeyId, expectedPolicyVersion, {
    ...existing,
    name: nextInput.name,
    billingAccountId: nextInput.billingAccountId,
    allowedModels: nextInput.allowedModels,
    totalLimitNanoUsd: nextInput.totalLimitNanoUsd,
    dailyLimitNanoUsd: nextInput.dailyLimitNanoUsd,
    policyVersion: nextInput.policyVersion,
    expiresAt: nextInput.expiresAt,
  });
  if (result === -2) return fail('BOTEARN_KEY_VERSION_CONFLICT', 409);
  if (result === -1) return fail('BOTEARN_KEY_NOT_ACTIVE', 409);
  if (result !== 1) return fail('BOTEARN_KEY_NOT_FOUND', 404);
  return NextResponse.json({
    id: externalKeyId,
    externalKeyId,
    keyPrefix: existing.keyPrefix,
    policyVersion: nextInput.policyVersion,
    updated: true,
  });
}

export async function DELETE(req: NextRequest) {
  const raw = await req.text();
  const authError = await authenticate(req, raw);
  if (authError) return authError;
  const body = parseBody(raw);
  const externalKeyId = typeof body?.externalKeyId === 'string' ? body.externalKeyId : '';
  const expectedPolicyVersion = typeof body?.expectedPolicyVersion === 'number'
    && Number.isSafeInteger(body.expectedPolicyVersion)
    ? body.expectedPolicyVersion
    : null;
  if (!UUID_RE.test(externalKeyId) || expectedPolicyVersion === null) {
    return fail('BOTEARN_KEY_INVALID');
  }

  const result = await revokeBotEarnKey(externalKeyId, expectedPolicyVersion);
  if (result === -2) return fail('BOTEARN_KEY_VERSION_CONFLICT', 409);
  if (result === 0) return fail('BOTEARN_KEY_NOT_FOUND', 404);
  return NextResponse.json({ id: externalKeyId, revoked: true, alreadyRevoked: result === 2 });
}
