import { redis } from './redis';

export interface UsageLogEntry {
  subKey: string;       // last 8 chars only
  userId?: string;
  vendor: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorCode?: number;
  timestamp: string;
}

const LOG_KEY = 'vault:usage:logs';
const MAX_LOGS = 5000;

export async function writeUsageLog(entry: UsageLogEntry): Promise<void> {
  await redis.lpush(LOG_KEY, JSON.stringify(entry));
  await redis.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
}

export async function getUsageLogs(opts: {
  limit?: number;
  offset?: number;
  vendor?: string;
  subKey?: string;
}): Promise<UsageLogEntry[]> {
  const { limit = 100, offset = 0, vendor, subKey } = opts;
  const raw = await redis.lrange<string>(LOG_KEY, offset, offset + limit - 1);
  return raw
    .map(r => { try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; } })
    .filter((e): e is UsageLogEntry => e !== null)
    .filter(e => (!vendor || e.vendor === vendor) && (!subKey || e.subKey === subKey));
}
