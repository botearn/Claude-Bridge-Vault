import { NextResponse } from 'next/server';
import { CATALOG_VERSION } from '@/lib/model-catalog';
import { getProbedVaultCatalog } from '@/lib/model-probes';

export async function GET() {
  const models = await getProbedVaultCatalog();
  return NextResponse.json(
    {
      catalog_version: CATALOG_VERSION,
      generated_at: new Date().toISOString(),
      data: models.map(model => ({
        id: model.id,
        provider: model.provider,
        upstream_model: model.upstreamModel,
        name: model.name,
        status: model.status,
        released_at: model.releasedAt,
        deprecates_at: model.deprecatesAt,
        context_window: model.contextWindow,
        max_output_tokens: model.maxOutputTokens,
        capabilities: model.capabilities,
        pricing: {
          snapshot_id: model.pricing.snapshotId,
          estimation_policy_version: model.pricing.estimationPolicyVersion,
          currency: model.pricing.currency,
          unit: model.pricing.unit,
          input_per_token: model.pricing.inputPerToken,
          cached_input_per_token: model.pricing.cachedInputPerToken,
          cache_write_per_token: model.pricing.cacheWritePerToken,
          output_per_token: model.pricing.outputPerToken,
          billing_status: model.pricing.billingStatus,
        },
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
