import { redis } from '@/lib/redis';

const TTL_DAYS = 35;

export interface DailyKeyEntry {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Record per-key daily usage stats.
 * Redis key: vault:daily:keys:{YYYY-MM-DD} (hash, field=subKey, value=JSON)
 * TTL: 35 days auto-expire.
 */
export async function recordDailyKeyUsage(
  subKey: string,
  date: string,
  increment: { calls: number; inputTokens: number; outputTokens: number; costUsd: number },
) {
  const redisKey = `vault:daily:keys:${date}`;
  try {
    const raw = await redis.hget(redisKey, subKey);
    const existing: DailyKeyEntry = raw
      ? (typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as DailyKeyEntry)
      : { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

    const updated: DailyKeyEntry = {
      calls: (existing.calls ?? 0) + increment.calls,
      inputTokens: (existing.inputTokens ?? 0) + increment.inputTokens,
      outputTokens: (existing.outputTokens ?? 0) + increment.outputTokens,
      costUsd: (existing.costUsd ?? 0) + increment.costUsd,
    };

    await redis.hset(redisKey, { [subKey]: JSON.stringify(updated) });
    await redis.expire(redisKey, TTL_DAYS * 24 * 3600);
  } catch (err) {
    console.warn('[daily-stats] failed to record', subKey, date, err);
  }
}
