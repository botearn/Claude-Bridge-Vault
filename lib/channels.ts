import { redis } from './redis';
import type { VendorId } from './types';

/* ─── Config ─── */
export interface ChannelData {
  id: string;
  vendor: VendorId;
  label: string;
  apiKey: string;
  enabled: boolean;   // admin-controlled on/off
  weight: number;
  createdAt: string;
}

/* ─── Health (written by proxy, separate from config) ─── */
export interface ChannelHealth {
  failCount: number;         // consecutive failures since last success
  lastError?: string;        // e.g. "HTTP 401"
  lastErrorAt?: string;
  lastSuccessAt?: string;
  circuitOpen: boolean;      // true = auto-disabled by circuit breaker
  circuitOpenAt?: string;    // when circuit was tripped
}

export interface ChannelWithHealth extends ChannelData {
  health: ChannelHealth;
}

/* Circuit breaker thresholds */
const FAIL_THRESHOLD = 3;                    // consecutive failures → open circuit
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000; // 5 min before probe attempt

const CONFIG_KEY = 'vault:channels';
const HEALTH_KEY = 'vault:channel:health';

/* ─── Internal helpers ─── */
function configField(vendor: VendorId, id: string) { return `${vendor}:${id}`; }

function parseConfig(raw: unknown): ChannelData | null {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw as ChannelData); } catch { return null; }
}

function parseHealth(raw: unknown): ChannelHealth {
  const defaults: ChannelHealth = { failCount: 0, circuitOpen: false };
  if (!raw) return defaults;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...defaults, ...parsed };
  } catch { return defaults; }
}

/* ─── Config CRUD ─── */

export async function getChannels(vendor?: VendorId): Promise<ChannelData[]> {
  const all = await redis.hgetall<Record<string, string>>(CONFIG_KEY);
  if (!all) return [];
  return Object.values(all)
    .map(parseConfig)
    .filter((c): c is ChannelData => c !== null && (!vendor || c.vendor === vendor));
}

export async function getChannelsWithHealth(vendor?: VendorId): Promise<ChannelWithHealth[]> {
  const channels = await getChannels(vendor);
  if (channels.length === 0) return [];

  const healthMap = await redis.hgetall<Record<string, string>>(HEALTH_KEY) ?? {};

  return channels.map(ch => ({
    ...ch,
    health: parseHealth(healthMap[ch.id]),
  }));
}

export async function addChannel(
  data: Omit<ChannelData, 'id' | 'createdAt'>
): Promise<ChannelData> {
  const id = Math.random().toString(36).slice(2, 10);
  const channel: ChannelData = { ...data, id, createdAt: new Date().toISOString() };
  await redis.hset(CONFIG_KEY, { [configField(data.vendor, id)]: JSON.stringify(channel) });
  return channel;
}

export async function updateChannel(
  vendor: VendorId,
  id: string,
  patch: Partial<Pick<ChannelData, 'label' | 'apiKey' | 'enabled' | 'weight'>>
): Promise<ChannelData | null> {
  const field = configField(vendor, id);
  const raw = await redis.hget<string>(CONFIG_KEY, field);
  const existing = parseConfig(raw);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await redis.hset(CONFIG_KEY, { [field]: JSON.stringify(updated) });
  return updated;
}

export async function deleteChannel(vendor: VendorId, id: string): Promise<void> {
  await Promise.all([
    redis.hdel(CONFIG_KEY, configField(vendor, id)),
    redis.hdel(HEALTH_KEY, id),
  ]);
}

/* ─── Health operations (called by proxy) ─── */

export async function recordChannelSuccess(id: string): Promise<void> {
  const raw = await redis.hget<string>(HEALTH_KEY, id);
  const prev = parseHealth(raw);
  // Only write if something changed (avoid noisy writes when already healthy)
  if (prev.failCount === 0 && !prev.circuitOpen) return;
  const updated: ChannelHealth = {
    failCount: 0,
    circuitOpen: false,
    lastSuccessAt: new Date().toISOString(),
  };
  await redis.hset(HEALTH_KEY, { [id]: JSON.stringify(updated) });
  if (prev.circuitOpen) {
    console.log(`[circuit] channel ${id} recovered ✓`);
  }
}

export async function recordChannelFailure(
  id: string,
  errorDesc: string,
): Promise<{ circuitJustOpened: boolean }> {
  const raw = await redis.hget<string>(HEALTH_KEY, id);
  const prev = parseHealth(raw);
  const newCount = (prev.circuitOpen ? prev.failCount : prev.failCount + 1);
  const shouldOpen = newCount >= FAIL_THRESHOLD;
  const updated: ChannelHealth = {
    ...prev,
    failCount: newCount,
    lastError: errorDesc,
    lastErrorAt: new Date().toISOString(),
    circuitOpen: shouldOpen,
    circuitOpenAt: shouldOpen && !prev.circuitOpen ? new Date().toISOString() : prev.circuitOpenAt,
  };
  await redis.hset(HEALTH_KEY, { [id]: JSON.stringify(updated) });
  if (shouldOpen && !prev.circuitOpen) {
    console.warn(`[circuit] channel ${id} circuit OPENED after ${newCount} failures (last: ${errorDesc})`);
  }
  return { circuitJustOpened: shouldOpen && !prev.circuitOpen };
}

/** Admin: manually reset circuit breaker for a channel */
export async function resetChannelHealth(id: string): Promise<void> {
  const reset: ChannelHealth = { failCount: 0, circuitOpen: false, lastSuccessAt: new Date().toISOString() };
  await redis.hset(HEALTH_KEY, { [id]: JSON.stringify(reset) });
}

/* ─── Proxy selection ─── */

export interface ProxyChannel {
  id: string;
  apiKey: string;
  isProbe: boolean;  // true = this is a recovery probe, treat failure differently
}

/**
 * Returns ordered list of channels for the proxy to try.
 * Priority:
 *   1. Enabled channels with closed circuit, sorted by weight (descending)
 *   2. One circuit-open channel past cooldown (recovery probe)
 * Env-var fallback is handled in the proxy itself.
 */
export async function getChannelsForProxy(vendor: VendorId): Promise<ProxyChannel[]> {
  const all = await getChannelsWithHealth(vendor);
  const now = Date.now();

  const healthy: ProxyChannel[] = [];
  let probeCandidate: ProxyChannel | null = null;

  for (const ch of all) {
    if (!ch.enabled || !ch.apiKey) continue;

    if (!ch.health.circuitOpen) {
      // Expand by weight
      const w = Math.max(1, Math.round(ch.weight));
      for (let i = 0; i < w; i++) {
        healthy.push({ id: ch.id, apiKey: ch.apiKey, isProbe: false });
      }
    } else {
      // Circuit open — check if past cooldown for probe
      const openAt = ch.health.circuitOpenAt ? new Date(ch.health.circuitOpenAt).getTime() : 0;
      if (now - openAt >= RECOVERY_COOLDOWN_MS && !probeCandidate) {
        probeCandidate = { id: ch.id, apiKey: ch.apiKey, isProbe: true };
      }
    }
  }

  // Shuffle healthy list (weight-aware round-robin)
  shuffle(healthy);

  return probeCandidate ? [...healthy, probeCandidate] : healthy;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
