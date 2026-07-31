import { getExplicitModelPrice, usdPerMillionToNanoUsdPerToken } from './billing.ts';
import type { ModelPrice } from './billing.ts';
import type { VendorId } from './types.ts';

const SONNET_5_STANDARD_PRICE_AT = Date.parse('2026-09-01T00:00:00.000Z');
export const CATALOG_VERSION = Date.now() >= SONNET_5_STANDARD_PRICE_AT
  ? '2026-09-01.1'
  : '2026-07-31.1';

const CATALOG_MODELS: {
  provider: VendorId;
  upstreamModel: string;
  name: string;
  releasedAt: string;
  contextWindow: number;
  maxOutputTokens: number;
}[] = [
  {
    provider: 'claude',
    upstreamModel: 'claude-fable-5',
    name: 'Claude Fable 5',
    releasedAt: '2026-06-09T00:00:00.000Z',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    provider: 'claude',
    upstreamModel: 'claude-opus-5',
    name: 'Claude Opus 5',
    releasedAt: '2026-07-24T00:00:00.000Z',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    provider: 'claude',
    upstreamModel: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    releasedAt: '2026-06-30T00:00:00.000Z',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    provider: 'claude',
    upstreamModel: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    releasedAt: '2025-10-01T00:00:00.000Z',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
  },
];

export interface VaultCatalogModel {
  id: string;
  provider: VendorId;
  upstreamModel: string;
  name: string;
  status: 'stable' | 'preview';
  releasedAt: string | null;
  deprecatesAt: string | null;
  contextWindow: number | null;
  maxOutputTokens: number;
  capabilities: string[];
  pricing: {
    snapshotId: string;
    estimationPolicyVersion: string;
    currency: 'USD';
    unit: 'nano_usd';
    inputPerToken: string;
    cachedInputPerToken: string;
    cacheWritePerToken: string;
    outputPerToken: string;
    billingStatus: 'active';
  };
}

function estimationPolicyVersion(model: string): number {
  return model === 'claude-sonnet-5' && Date.now() >= SONNET_5_STANDARD_PRICE_AT
    ? 2
    : 1;
}

function snapshotId(
  vendor: VendorId,
  model: string,
  price: ModelPrice,
  policyVersion: number,
): string {
  const encodedModel = model.replace(/[^A-Za-z0-9._-]/g, '_');
  return [
    'price',
    vendor,
    encodedModel,
    `p${policyVersion}`,
    Math.round(price.input * 1_000),
    Math.round(price.output * 1_000),
  ].join(':');
}

export function catalogModelId(vendor: VendorId, upstreamModel: string): string {
  return `${vendor}/${upstreamModel}`;
}

export function getVaultCatalog(): VaultCatalogModel[] {
  const models: VaultCatalogModel[] = [];
  for (const entry of CATALOG_MODELS) {
    const price = getExplicitModelPrice(entry.provider, entry.upstreamModel);
    if (!price) continue;
    const policyVersion = estimationPolicyVersion(entry.upstreamModel);
    models.push({
      id: catalogModelId(entry.provider, entry.upstreamModel),
      provider: entry.provider,
      upstreamModel: entry.upstreamModel,
      name: entry.name,
      status: 'stable',
      releasedAt: entry.releasedAt,
      deprecatesAt: null,
      contextWindow: entry.contextWindow,
      maxOutputTokens: entry.maxOutputTokens,
      capabilities: ['text', 'vision', 'tools', 'structured_output'],
      pricing: {
        snapshotId: snapshotId(
          entry.provider,
          entry.upstreamModel,
          price,
          policyVersion,
        ),
        estimationPolicyVersion: String(policyVersion),
        currency: 'USD',
        unit: 'nano_usd',
        inputPerToken: usdPerMillionToNanoUsdPerToken(price.input).toString(),
        cachedInputPerToken: usdPerMillionToNanoUsdPerToken(price.cachedInput).toString(),
        cacheWritePerToken: usdPerMillionToNanoUsdPerToken(price.cacheWrite).toString(),
        outputPerToken: usdPerMillionToNanoUsdPerToken(price.output).toString(),
        billingStatus: 'active',
      },
    });
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export function findCatalogModel(
  vendor: VendorId,
  upstreamModel: string | undefined,
): VaultCatalogModel | null {
  if (!upstreamModel) return null;
  const id = catalogModelId(vendor, upstreamModel);
  return getVaultCatalog().find(model => model.id === id) ?? null;
}
