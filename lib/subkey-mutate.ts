import { redis } from './redis';

const HASH_KEY = 'vault:subkeys';

const APPLY_DELTA_LUA = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then return 0 end
local obj = cjson.decode(current)
local patch = cjson.decode(ARGV[2])
if patch.usageInc then obj.usage = (obj.usage or 0) + patch.usageInc end
if patch.inputTokensInc then obj.inputTokens = (obj.inputTokens or 0) + patch.inputTokensInc end
if patch.outputTokensInc then obj.outputTokens = (obj.outputTokens or 0) + patch.outputTokensInc end
if patch.costUsdInc then obj.costUsd = (obj.costUsd or 0) + patch.costUsdInc end
if patch.lastUsed then obj.lastUsed = patch.lastUsed end
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(obj))
return 1
`;

export interface SubKeyDelta {
  usageInc?: number;
  inputTokensInc?: number;
  outputTokensInc?: number;
  costUsdInc?: number;
  lastUsed?: string;
}

/** Atomically apply a delta to a sub-key's mutable counters in Redis.
 *  Uses a Lua script to avoid read-modify-write races between concurrent proxy requests. */
export async function applySubKeyDelta(subKey: string, delta: SubKeyDelta): Promise<void> {
  await redis.eval(APPLY_DELTA_LUA, [HASH_KEY], [subKey, JSON.stringify(delta)]);
}
