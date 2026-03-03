'use client';

type VaultSyncPayload = {
  ts: number;
  source?: string;
  vendor?: string;
  group?: string;
  subKey?: string;
};

const CHANNEL_NAME = 'vault-sync';
const STORAGE_KEY = 'vault:sync';
const EVENT_NAME = 'vault:sync';

export function emitVaultSync(payload: Omit<VaultSyncPayload, 'ts'> = {}) {
  if (typeof window === 'undefined') return;
  const msg: VaultSyncPayload = { ts: Date.now(), ...payload };

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage(msg);
      ch.close();
    }
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: msg }));
  } catch {
    // ignore
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msg));
  } catch {
    // ignore
  }
}

export function onVaultSync(handler: (payload: VaultSyncPayload) => void) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (e: Event) => {
    const ce = e as CustomEvent<VaultSyncPayload>;
    if (ce?.detail) handler(ce.detail);
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue) as VaultSyncPayload);
    } catch {
      // ignore
    }
  };

  let ch: BroadcastChannel | null = null;
  const onBC = (e: MessageEvent) => {
    if (e?.data) handler(e.data as VaultSyncPayload);
  };

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(CHANNEL_NAME);
      ch.addEventListener('message', onBC);
    }
  } catch {
    ch = null;
  }

  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener('storage', onStorage);
    try {
      ch?.removeEventListener('message', onBC);
      ch?.close();
    } catch {
      // ignore
    }
  };
}
