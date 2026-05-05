import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { getChannelsWithHealth } from '@/lib/channels';
import { redis } from '@/lib/redis';
import type { ChannelWithHealth } from '@/lib/channels';
import type { SubKeyData, UserData } from '@/lib/types';

type SessionLike = Awaited<ReturnType<typeof verifySessionToken>>;

export async function getCompatSession(req?: NextRequest) {
  if (req) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    return token ? verifySessionToken(token) : null;
  }

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : null;
}

export function unauthorized() {
  return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
}

export async function requireCompatSession(req?: NextRequest) {
  const session = await getCompatSession(req);
  return session ?? null;
}

export async function requireCompatAdmin(req?: NextRequest) {
  const session = await getCompatSession(req);
  return session?.role === 'admin' ? session : null;
}

export function parseStoredValue<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

export function safeTimestamp(input?: string | null, unit: 'ms' | 's' = 'ms') {
  if (!input) return unit === 'ms' ? 0 : 0;
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return 0;
  return unit === 's' ? Math.floor(ts / 1000) : ts;
}

export function mapCompatUser(user: UserData) {
  return {
    id: Number(user.id) || 1,
    username: user.email,
    display_name: user.name,
    email: user.email,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: user.role === 'admin' ? 'admin' : 'default',
    status: 1,
    role: user.role === 'admin' ? 10 : 1,
    created_at: safeTimestamp(user.createdAt, 's'),
    updated_at: safeTimestamp(user.createdAt, 's'),
    last_login_at: 0,
    remark: '',
    aff_code: '',
    aff_count: 0,
    aff_quota: 0,
    aff_history_quota: 0,
    inviter_id: 0,
  };
}

export function mapCompatToken(
  storedKey: string,
  key: SubKeyData,
  index: number,
  isAdmin: boolean,
  session: NonNullable<SessionLike>,
) {
  if (!isAdmin && key.userId !== session.userId) {
    return null;
  }

  const usedQuota = (key.inputTokens || 0) + (key.outputTokens || 0);
  const totalQuota = key.totalQuota || 0;
  const expired = key.expiresAt ? new Date(key.expiresAt).getTime() < Date.now() : false;
  const exhausted = key.totalQuota != null && usedQuota >= key.totalQuota;
  const remainQuota = key.totalQuota == null ? 0 : Math.max(0, totalQuota - usedQuota);

  return {
    id: index + 1,
    name: key.name,
    key: storedKey,
    status: expired ? 3 : exhausted ? 4 : 1,
    remain_quota: remainQuota,
    used_quota: usedQuota,
    unlimited_quota: key.totalQuota == null,
    expired_time: key.expiresAt ? safeTimestamp(key.expiresAt, 's') : -1,
    created_time: safeTimestamp(key.createdAt, 's'),
    accessed_time: key.lastUsed ? safeTimestamp(key.lastUsed, 's') : 0,
    group: key.group ?? '',
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
  };
}

function toChannelType(vendor: string): number {
  if (vendor === 'claude') return 14;
  if (vendor === 'amazon') return 3;
  if (vendor === 'clawos' || vendor === 'clawos-overseas') return 1;
  return 1;
}

function channelStatus(channel: ChannelWithHealth) {
  if (!channel.enabled) return 0;
  if (channel.health.circuitOpen) return 2;
  return 1;
}

export function mapCompatChannel(channel: ChannelWithHealth, index: number) {
  return {
    id: index + 1,
    type: toChannelType(channel.vendor),
    key: channel.apiKey,
    openai_organization: '',
    test_model: '',
    status: channelStatus(channel),
    name: channel.label,
    weight: channel.weight,
    created_time: safeTimestamp(channel.createdAt),
    test_time: channel.health.lastSuccessAt ? safeTimestamp(channel.health.lastSuccessAt) : 0,
    response_time: 0,
    base_url: '',
    other: '',
    balance: 0,
    balance_updated_time: 0,
    models: '',
    group: channel.vendor,
    used_quota: 0,
    model_mapping: '',
    status_code_mapping: '',
    priority: 0,
    auto_ban: 0,
    other_info: channel.health.lastError ?? '',
    tag: '',
    setting: '',
    param_override: '',
    header_override: '',
    remark: '',
    max_input_tokens: 0,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_polling_index: 0,
      multi_key_mode: 'random',
    },
    settings: '{}',
  };
}

export async function loadCompatUsers() {
  const rawUsers = (await redis.hgetall<Record<string, string>>('vault:users')) ?? {};
  return Object.values(rawUsers)
    .map((value) => parseStoredValue<UserData>(value))
    .filter((value): value is UserData => value !== null);
}

export async function loadCompatTokens() {
  const rawKeys = (await redis.hgetall<Record<string, string>>('vault:subkeys')) ?? {};
  return Object.entries(rawKeys)
    .map(([storedKey, value]) => {
      const parsed = parseStoredValue<SubKeyData>(value);
      return parsed ? { storedKey, key: parsed } : null;
    })
    .filter((value): value is { storedKey: string; key: SubKeyData } => value !== null);
}

export async function loadCompatChannels() {
  return getChannelsWithHealth();
}

export function includesLike(value: string | undefined, needle: string) {
  return value?.toLowerCase().includes(needle.toLowerCase()) ?? false;
}

export async function getCompatTokenById(id: number) {
  const index = id - 1;
  if (index < 0) return null;

  const tokens = await loadCompatTokens();
  return tokens[index] ? { index, token: tokens[index] } : null;
}

export function compatPayloadToSubKeyRecord(
  payload: any,
  userId: string | undefined,
  existing?: SubKeyData,
): SubKeyData {
  const remainQuota = Number(payload?.remain_quota);
  const quota = payload?.unlimited_quota
    ? null
    : Number.isFinite(remainQuota)
      ? Math.max(0, Math.floor(remainQuota))
      : existing?.totalQuota ?? null;

  const usedTokens = (existing?.inputTokens || 0) + (existing?.outputTokens || 0);
  const totalQuota = quota == null ? null : Math.max(usedTokens, quota + usedTokens);

  const expiresAt =
    Number(payload?.expired_time) > 0
      ? new Date(Number(payload.expired_time) * 1000).toISOString()
      : null;

  return {
    vendor: existing?.vendor ?? 'amazon',
    scope: existing?.scope ?? 'internal',
    usage: existing?.usage ?? 0,
    inputTokens: existing?.inputTokens ?? 0,
    outputTokens: existing?.outputTokens ?? 0,
    costUsd: existing?.costUsd ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastUsed: existing?.lastUsed ?? null,
    userId: existing?.userId ?? userId,
    name:
      typeof payload?.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : existing?.name ?? 'default',
    group:
      typeof payload?.group === 'string' && payload.group.trim()
        ? payload.group.trim()
        : existing?.group ?? 'default',
    totalQuota,
    expiresAt,
    model:
      typeof payload?.model === 'string' && payload.model.trim()
        ? payload.model.trim()
        : existing?.model,
    rpmLimit: existing?.rpmLimit ?? null,
    tpmLimit: existing?.tpmLimit ?? null,
    budgetUsd: existing?.budgetUsd ?? null,
  };
}
