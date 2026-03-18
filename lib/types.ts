export type VendorId = 'claude' | 'youragent' | 'yunwu';
export type AuthStyle = 'x-api-key' | 'bearer';
export type KeyScope = 'internal' | 'external';

export interface VendorConfig {
  label: string;
  endpoint: string;
  authStyle: AuthStyle;
  envKey: string;
  keyPrefix: string;
  basePath: string;
}

export interface SubKeyData {
  name: string;
  vendor: VendorId;
  group: string;
  scope?: KeyScope;            // default 'internal' for backward compat
  model?: string;              // default model for this key (optional)
  usage: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
  lastUsed: string | null;
  totalQuota: number | null;   // null = unlimited
  expiresAt: string | null;    // null = no expiry
}

export interface SubKeyRecord extends SubKeyData {
  key: string;
  baseUrl: string;
}
