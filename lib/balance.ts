import { redis } from './redis';

const BALANCE_PREFIX = 'vault:balance:';

// Store balance in micro-cents (1 USD = 1,000,000 units) for sub-cent precision
const UNITS_PER_USD = 1_000_000;

function balanceKey(userId: string) {
  return `${BALANCE_PREFIX}${userId}`;
}

/** Get balance in USD (float). Returns 0 if not set. */
export async function getBalance(userId: string): Promise<number> {
  const raw = await redis.get<string>(balanceKey(userId));
  if (!raw) return 0;
  const units = parseInt(raw, 10);
  return Number.isNaN(units) ? 0 : units / UNITS_PER_USD;
}

/** Add amount (USD) to balance. Returns new balance in USD. */
export async function addBalance(userId: string, amountUsd: number): Promise<number> {
  const units = Math.round(amountUsd * UNITS_PER_USD);
  if (units <= 0) throw new Error('Amount must be positive');
  const newUnits = await redis.incrby(balanceKey(userId), units);
  return newUnits / UNITS_PER_USD;
}

/**
 * Deduct amount (USD) from balance atomically.
 * Returns { ok, newBalance }. If insufficient, ok=false and no deduction happens.
 */
export async function deductBalance(
  userId: string,
  amountUsd: number,
): Promise<{ ok: boolean; balance: number }> {
  const units = Math.round(amountUsd * UNITS_PER_USD);
  if (units <= 0) return { ok: true, balance: await getBalance(userId) };

  // Atomic deduct — allows negative balance (pay-as-you-go)
  const newUnits = await redis.decrby(balanceKey(userId), units);
  return { ok: true, balance: newUnits / UNITS_PER_USD };
}
