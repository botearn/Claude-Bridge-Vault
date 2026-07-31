import { randomBytes } from 'crypto';
import { redis } from './redis';
import { botEarnKeyPrefix, botEarnStorageKey } from './subkey-storage';
import type { SubKeyData } from './types';

const SUBKEY_HASH = 'vault:subkeys';
const EXTERNAL_KEY_HASH = 'vault:botearn:external-keys';

const CREATE_KEY_LUA = `
if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
return 1
`;

const UPDATE_KEY_LUA = `
local storageKey = redis.call('HGET', KEYS[2], ARGV[1])
if not storageKey then return 0 end
local current = redis.call('HGET', KEYS[1], storageKey)
if not current then return 0 end
local obj = cjson.decode(current)
if (obj.status or 'active') ~= 'active' then return -1 end
if tonumber(obj.policyVersion or 0) ~= tonumber(ARGV[2]) then return -2 end
redis.call('HSET', KEYS[1], storageKey, ARGV[3])
return 1
`;

const REVOKE_KEY_LUA = `
local storageKey = redis.call('HGET', KEYS[2], ARGV[1])
if not storageKey then return 0 end
local current = redis.call('HGET', KEYS[1], storageKey)
if not current then return 0 end
local obj = cjson.decode(current)
if (obj.status or 'active') == 'revoked' then return 2 end
if tonumber(obj.policyVersion or 0) ~= tonumber(ARGV[2]) then return -2 end
obj.status = 'revoked'
obj.revokedAt = ARGV[3]
redis.call('HSET', KEYS[1], storageKey, cjson.encode(obj))
return 1
`;

export interface BotEarnKeyInput {
  name: string;
  externalKeyId: string;
  billingAccountId: string;
  allowedModels: string[];
  totalLimitNanoUsd: string;
  dailyLimitNanoUsd: string;
  policyVersion: number;
  expiresAt: string | null;
}
export interface BotEarnCreatedKey {
  created: boolean;
  subKey?: string;
  keyPrefix: string;
  externalKeyId: string;
}

function generateSubKey(): string {
  return `sk-vault-botearn_${randomBytes(32).toString('base64url')}`;
}

function parseRecord(raw: unknown): SubKeyData | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as SubKeyData;
    } catch {
      return null;
    }
  }
  return raw as SubKeyData;
}

export async function loadBotEarnKey(externalKeyId: string): Promise<SubKeyData | null> {
  const storageKey = await redis.hget<string>(EXTERNAL_KEY_HASH, externalKeyId);
  if (!storageKey) return null;
  return parseRecord(await redis.hget(SUBKEY_HASH, storageKey));
}

export async function createBotEarnKey(input: BotEarnKeyInput): Promise<BotEarnCreatedKey> {
  const subKey = generateSubKey();
  const storageKey = botEarnStorageKey(subKey);
  const keyPrefix = botEarnKeyPrefix(subKey);
  const now = new Date().toISOString();
  const record: SubKeyData = {
    name: input.name,
    vendor: 'claude',
    group: 'botearn',
    scope: 'external',
    usage: 0,
    createdAt: now,
    lastUsed: null,
    totalQuota: null,
    expiresAt: input.expiresAt,
    billingMode: 'botearn_ai_balance',
    billingAccountId: input.billingAccountId,
    externalKeyId: input.externalKeyId,
    allowedModels: input.allowedModels,
    totalLimitNanoUsd: input.totalLimitNanoUsd,
    dailyLimitNanoUsd: input.dailyLimitNanoUsd,
    policyVersion: input.policyVersion,
    keyPrefix,
    status: 'active',
  };

  const created = Number(await redis.eval(
    CREATE_KEY_LUA,
    [SUBKEY_HASH, EXTERNAL_KEY_HASH],
    [input.externalKeyId, storageKey, JSON.stringify(record)],
  )) === 1;

  if (created) {
    return { created: true, subKey, keyPrefix, externalKeyId: input.externalKeyId };
  }

  const existing = await loadBotEarnKey(input.externalKeyId);
  return {
    created: false,
    keyPrefix: existing?.keyPrefix ?? 'sk-vault-botearn',
    externalKeyId: input.externalKeyId,
  };
}

export async function updateBotEarnKey(
  externalKeyId: string,
  expectedPolicyVersion: number,
  next: SubKeyData,
): Promise<number> {
  return Number(await redis.eval(
    UPDATE_KEY_LUA,
    [SUBKEY_HASH, EXTERNAL_KEY_HASH],
    [externalKeyId, String(expectedPolicyVersion), JSON.stringify(next)],
  ));
}

export async function revokeBotEarnKey(
  externalKeyId: string,
  expectedPolicyVersion: number,
): Promise<number> {
  return Number(await redis.eval(
    REVOKE_KEY_LUA,
    [SUBKEY_HASH, EXTERNAL_KEY_HASH],
    [externalKeyId, String(expectedPolicyVersion), new Date().toISOString()],
  ));
}
