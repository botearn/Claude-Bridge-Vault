import { createHash } from 'crypto';

export function hashSubKey(subKey: string): string {
  return createHash('sha256').update(subKey).digest('hex');
}
export function botEarnStorageKey(subKey: string): string {
  return `sha256:${hashSubKey(subKey)}`;
}

export function botEarnKeyPrefix(subKey: string): string {
  return subKey.slice(0, Math.min(subKey.length, 26));
}
