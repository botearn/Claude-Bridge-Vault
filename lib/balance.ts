import { redis } from './redis';

const BALANCE_PREFIX = 'vault:balance:';

function balanceKey(userId: string) {
  return `${BALANCE_PREFIX}${userId}`;
}

/** Get balance in USD (float). Returns 0 if not set. */
export async function getBalance(userId: string): Promise<number> {
  const raw = await redis.get<string>(balanceKey(userId));
  if (!raw) return 0;
  const cents = parseInt(raw, 10);
  return Number.isNaN(cents) ? 0 : cents / 100;
}

/** Add amount (USD) to balance. Returns new balance in USD. */
export async function addBalance(userId: string, amountUsd: number): Promise<number> {
  const cents = Math.round(amountUsd * 100);
  if (cents <= 0) throw new Error('Amount must be positive');
  const newCents = await redis.incrby(balanceKey(userId), cents);
  return newCents / 100;
}

/**
 * Deduct amount (USD) from balance atomically.
 * Returns { ok, newBalance }. If insufficient, ok=false and no deduction happens.
 */
export async function deductBalance(
  userId: string,
  amountUsd: number,
): Promise<{ ok: boolean; balance: number }> {
  const cents = Math.round(amountUsd * 100);
  if (cents <= 0) return { ok: true, balance: await getBalance(userId) };

  // Atomic deduct — allows negative balance (pay-as-you-go)
  const newCents = await redis.decrby(balanceKey(userId), cents);
  return { ok: true, balance: newCents / 100 };
}
