/* ── User ── */
export interface UserData {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export type VendorId = 'claude' | 'tokenutopia' | 'palebluedot' | 'clawos' | 'clawos-overseas' | 'amazon';
export type AuthStyle = 'x-api-key' | 'bearer';
export type KeyScope = 'internal' | 'external';
export type BillingMode = 'legacy' | 'botearn_ai_balance';
export type SubKeyStatus = 'active' | 'revoke_pending' | 'revoked';

export interface VendorConfig {
  label: string;
  baseUrl: string;
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
  userId?: string;             // owner user id (null = legacy admin-created)
  usage: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
  lastUsed: string | null;
  totalQuota: number | null;   // null = unlimited
  expiresAt: string | null;    // null = no expiry
  rpmLimit?: number | null;    // requests per minute limit (null = unlimited)
  tpmLimit?: number | null;    // tokens per minute limit (null = unlimited)
  budgetUsd?: number | null;   // max USD spend per key (null = unlimited)
  billingMode?: BillingMode;   // missing means legacy
  billingAccountId?: string;
  externalKeyId?: string;
  allowedModels?: string[];
  totalLimitNanoUsd?: string;
  dailyLimitNanoUsd?: string;
  policyVersion?: number;
  keyPrefix?: string;
  status?: SubKeyStatus;       // missing means active for legacy records
}

export interface SubKeyRecord extends SubKeyData {
  key: string;
  baseUrl: string;
}

export interface CompatVendorData {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompatModelData {
  id: string;
  modelName: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendorKey?: string | null;
  endpoints?: string;
  status: number;
  syncOfficial: number;
  nameRule: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrefillGroupData {
  id: string;
  name: string;
  type: 'model' | 'tag' | 'endpoint';
  items: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}
