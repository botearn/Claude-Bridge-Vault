import { redis } from './redis';

/**
 * Check RPM limit for a sub-key.
 * Uses a sliding 60-second window via Redis INCR + EXPIRE.
 * Returns { ok, count } where ok=false means limit exceeded.
 */
export async function checkRpmLimit(
  subKey: string,
  rpmLimit: number,
): Promise<{ ok: boolean; count: number; limit: number }> {
  const window = Math.floor(Date.now() / 60000); // 1-minute bucket
  const rKey = `vault:rpm:${subKey}:${window}`;
  const count = await redis.incr(rKey);
  if (count === 1) await redis.expire(rKey, 120); // 2-minute TTL to cover boundary
  return { ok: count <= rpmLimit, count, limit: rpmLimit };
}

/**
 * Check TPM limit for a sub-key.
 * Adds tokens to a 60-second bucket and checks against limit.
 */
export async function checkTpmLimit(
  subKey: string,
  tpmLimit: number,
  tokens: number,
): Promise<{ ok: boolean; count: number; limit: number }> {
  const window = Math.floor(Date.now() / 60000);
  const tKey = `vault:tpm:${subKey}:${window}`;
  const count = await redis.incrby(tKey, tokens);
  if (count === tokens) await redis.expire(tKey, 120);
  return { ok: count <= tpmLimit, count, limit: tpmLimit };
}

/** Get current RPM usage without incrementing */
export async function getRpmUsage(subKey: string): Promise<number> {
  const window = Math.floor(Date.now() / 60000);
  const raw = await redis.get<string>(`vault:rpm:${subKey}:${window}`);
  return raw ? parseInt(raw, 10) : 0;
}

/** Get current TPM usage in this minute without incrementing */
export async function getTpmUsage(subKey: string): Promise<number> {
  const window = Math.floor(Date.now() / 60000);
  const raw = await redis.get<string>(`vault:tpm:${subKey}:${window}`);
  return raw ? parseInt(raw, 10) : 0;
}
