import { redis } from './redis';
import { getChannelsForProxy } from './channels';
import { VENDOR_CONFIG } from './vendors';
import {
  CATALOG_VERSION,
  getVaultCatalog,
  type VaultCatalogModel,
} from './model-catalog';

const PROBE_HASH = 'vault:botearn:model-probes';
const PROBE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

interface ProbeResult {
  modelId: string;
  status: 'passed' | 'failed';
  probedAt: string;
  catalogVersion: string;
  capabilities: string[];
  errorCode?: string;
}

function parseProbeResult(value: unknown): ProbeResult | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ProbeResult;
    } catch {
      return null;
    }
  }
  return value as ProbeResult;
}

async function providerKey(model: VaultCatalogModel): Promise<string | null> {
  const channels = await getChannelsForProxy(model.provider).catch(() => []);
  if (channels[0]?.apiKey) return channels[0].apiKey;
  return (process.env[VENDOR_CONFIG[model.provider].envKey] ?? '')
    .split(',')
    .map(value => value.trim())
    .find(Boolean) ?? null;
}

async function callClaude(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`PROVIDER_${response.status}`);
  const usage = data.usage as Record<string, unknown> | undefined;
  if (typeof usage?.input_tokens !== 'number'
    || typeof usage?.output_tokens !== 'number') {
    throw new Error('USAGE_MISSING');
  }
  return data;
}

async function probeClaude(model: VaultCatalogModel, apiKey: string): Promise<void> {
  const toolResponse = await callClaude(apiKey, {
    model: model.upstreamModel,
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: PIXEL_PNG_BASE64,
          },
        },
        { type: 'text', text: 'Call record_probe with ok=true.' },
      ],
    }],
    tools: [{
      name: 'record_probe',
      description: 'Records a harmless model capability probe.',
      input_schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
      strict: true,
    }],
    tool_choice: { type: 'tool', name: 'record_probe' },
  });
  const content = Array.isArray(toolResponse.content) ? toolResponse.content : [];
  const toolUse = content.find((item) =>
    item && typeof item === 'object'
      && (item as Record<string, unknown>).type === 'tool_use'
      && (item as Record<string, unknown>).name === 'record_probe'
  ) as Record<string, unknown> | undefined;
  if ((toolUse?.input as Record<string, unknown> | undefined)?.ok !== true) {
    throw new Error('TOOL_PROBE_FAILED');
  }

  const structuredResponse = await callClaude(apiKey, {
    model: model.upstreamModel,
    max_tokens: 128,
    messages: [{ role: 'user', content: 'Return a successful probe result.' }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean', const: true } },
          required: ['ok'],
          additionalProperties: false,
        },
      },
    },
  });
  const structuredContent = Array.isArray(structuredResponse.content)
    ? structuredResponse.content
    : [];
  const text = structuredContent.find((item) =>
    item && typeof item === 'object'
      && (item as Record<string, unknown>).type === 'text'
  ) as Record<string, unknown> | undefined;
  if (typeof text?.text !== 'string'
    || (JSON.parse(text.text) as Record<string, unknown>).ok !== true) {
    throw new Error('STRUCTURED_OUTPUT_PROBE_FAILED');
  }
}

export async function runCatalogProbes(): Promise<{
  attempted: number;
  passed: number;
  failed: number;
}> {
  const models = getVaultCatalog();
  let passed = 0;
  let failed = 0;

  for (const model of models) {
    let result: ProbeResult;
    try {
      const apiKey = await providerKey(model);
      if (!apiKey) throw new Error('PROVIDER_KEY_MISSING');
      if (model.provider !== 'claude') throw new Error('PROVIDER_PROBE_NOT_IMPLEMENTED');
      await probeClaude(model, apiKey);
      result = {
        modelId: model.id,
        status: 'passed',
        probedAt: new Date().toISOString(),
        catalogVersion: CATALOG_VERSION,
        capabilities: model.capabilities,
      };
      passed += 1;
    } catch (error) {
      result = {
        modelId: model.id,
        status: 'failed',
        probedAt: new Date().toISOString(),
        catalogVersion: CATALOG_VERSION,
        capabilities: [],
        errorCode: error instanceof Error
          ? error.message.replace(/[^A-Z0-9_]/gi, '_').slice(0, 80)
          : 'PROBE_FAILED',
      };
      failed += 1;
    }
    await redis.hset(PROBE_HASH, { [model.id]: JSON.stringify(result) });
  }

  return { attempted: models.length, passed, failed };
}

export async function getProbedVaultCatalog(): Promise<VaultCatalogModel[]> {
  const catalog = getVaultCatalog();
  const results = await redis.hmget<Record<string, ProbeResult>>(
    PROBE_HASH,
    ...catalog.map(model => model.id),
  );
  return catalog.filter((model) => {
    const result = parseProbeResult(results?.[model.id]);
    return result?.status === 'passed'
      && result.catalogVersion === CATALOG_VERSION
      && Date.now() - Date.parse(result.probedAt) <= PROBE_MAX_AGE_MS;
  });
}

export async function isModelProbePassed(modelId: string): Promise<boolean> {
  const result = parseProbeResult(
    await redis.hget(PROBE_HASH, modelId),
  );
  return result?.status === 'passed'
    && result.catalogVersion === CATALOG_VERSION
    && Date.now() - Date.parse(result.probedAt) <= PROBE_MAX_AGE_MS;
}
