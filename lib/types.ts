export type VendorId = 'claude' | 'openai' | 'gemini' | 'youragent';
export type AuthStyle = 'x-api-key' | 'bearer' | 'query-param';

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
