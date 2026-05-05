import { loadCompatChannels, parseStoredValue, safeTimestamp } from '@/lib/console-compat';
import { redis } from '@/lib/redis';
import type { CompatModelData, CompatVendorData, PrefillGroupData } from '@/lib/types';

const VENDORS_KEY = 'vault:compat:vendors';
const MODELS_KEY = 'vault:compat:models';
const PREFILL_GROUPS_KEY = 'vault:prefill_groups';

function sortByCreatedAt<T extends { createdAt: string; id: string }>(items: T[]) {
  return items.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
}

function splitCsv(value?: string | null) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeItems(items: unknown) {
  if (Array.isArray(items)) {
    return items.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof items === 'string') {
    return items
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function matchesModel(rule: number, modelName: string, candidate: string) {
  if (!candidate) return false;
  if (rule === 1) return candidate.startsWith(modelName);
  if (rule === 2) return candidate.includes(modelName);
  if (rule === 3) return candidate.endsWith(modelName);
  return candidate === modelName;
}

export async function loadCompatVendors() {
  const raw = (await redis.hgetall<Record<string, string>>(VENDORS_KEY)) ?? {};
  return sortByCreatedAt(
    Object.values(raw)
      .map((value) => parseStoredValue<CompatVendorData>(value))
      .filter((value): value is CompatVendorData => value !== null)
  );
}

export async function loadCompatModels() {
  const raw = (await redis.hgetall<Record<string, string>>(MODELS_KEY)) ?? {};
  return sortByCreatedAt(
    Object.values(raw)
      .map((value) => parseStoredValue<CompatModelData>(value))
      .filter((value): value is CompatModelData => value !== null)
  );
}

export async function loadPrefillGroups() {
  const raw = (await redis.hgetall<Record<string, string>>(PREFILL_GROUPS_KEY)) ?? {};
  return sortByCreatedAt(
    Object.values(raw)
      .map((value) => parseStoredValue<PrefillGroupData>(value))
      .filter((value): value is PrefillGroupData => value !== null)
  );
}

export async function getCompatVendorById(id: number) {
  const index = id - 1;
  if (index < 0) return null;
  const vendors = await loadCompatVendors();
  return vendors[index] ? { index, vendor: vendors[index] } : null;
}

export async function getCompatModelById(id: number) {
  const index = id - 1;
  if (index < 0) return null;
  const models = await loadCompatModels();
  return models[index] ? { index, model: models[index] } : null;
}

export async function getPrefillGroupById(id: number) {
  const index = id - 1;
  if (index < 0) return null;
  const groups = await loadPrefillGroups();
  return groups[index] ? { index, group: groups[index] } : null;
}

export function mapCompatVendor(vendor: CompatVendorData, index: number) {
  return {
    id: index + 1,
    name: vendor.name,
    description: vendor.description ?? '',
    icon: vendor.icon ?? '',
    status: vendor.status ?? 1,
    created_time: safeTimestamp(vendor.createdAt, 's'),
    updated_time: safeTimestamp(vendor.updatedAt, 's'),
  };
}

export function mapPrefillGroup(group: PrefillGroupData, index: number) {
  return {
    id: index + 1,
    name: group.name,
    type: group.type,
    items: group.items,
    description: group.description ?? '',
  };
}

export async function mapCompatModel(model: CompatModelData, index: number) {
  const [vendors, channels] = await Promise.all([loadCompatVendors(), loadCompatChannels()]);
  const vendorIndex = model.vendorKey
    ? vendors.findIndex((item) => item.id === model.vendorKey)
    : -1;
  const channelMatches = channels.filter((channel) => {
    const candidates = splitCsv(channel.models);
    return candidates.some((candidate) => matchesModel(model.nameRule ?? 0, model.modelName, candidate));
  });
  const matchedModels = uniqueStrings(
    channelMatches.flatMap((channel) =>
      splitCsv(channel.models).filter((candidate) =>
        matchesModel(model.nameRule ?? 0, model.modelName, candidate)
      )
    )
  );

  return {
    id: index + 1,
    model_name: model.modelName,
    description: model.description ?? '',
    icon: model.icon ?? '',
    tags: model.tags ?? '',
    vendor_id: vendorIndex >= 0 ? vendorIndex + 1 : undefined,
    endpoints: model.endpoints ?? '',
    status: model.status ?? 1,
    sync_official: model.syncOfficial ?? 1,
    created_time: safeTimestamp(model.createdAt, 's'),
    updated_time: safeTimestamp(model.updatedAt, 's'),
    name_rule: model.nameRule ?? 0,
    bound_channels: channelMatches.map((channel) => ({
      name: channel.label,
      type: channel.type ?? 0,
    })),
    enable_groups: [],
    quota_types: [],
    matched_models: model.nameRule === 0 ? [] : matchedModels,
    matched_count: model.nameRule === 0 ? 0 : matchedModels.length,
  };
}

export async function listCompatModelsMapped() {
  const models = await loadCompatModels();
  return Promise.all(models.map((model, index) => mapCompatModel(model, index)));
}

export async function listCompatVendorsMapped() {
  const vendors = await loadCompatVendors();
  return vendors.map((vendor, index) => mapCompatVendor(vendor, index));
}

export async function listPrefillGroupsMapped() {
  const groups = await loadPrefillGroups();
  return groups.map((group, index) => mapPrefillGroup(group, index));
}

export function createCompatVendorRecord(
  payload: any,
  existing?: CompatVendorData
): CompatVendorData | null {
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : existing?.name ?? '';
  if (!name) return null;

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `vendor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description:
      typeof payload?.description === 'string'
        ? payload.description
        : existing?.description ?? '',
    icon:
      typeof payload?.icon === 'string'
        ? payload.icon
        : existing?.icon ?? '',
    status:
      Number.isFinite(Number(payload?.status)) ? Number(payload.status) : existing?.status ?? 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function createCompatModelRecord(
  payload: any,
  existing?: CompatModelData
): Promise<CompatModelData | null> {
  const modelName =
    typeof payload?.model_name === 'string' && payload.model_name.trim()
      ? payload.model_name.trim()
      : existing?.modelName ?? '';
  if (!modelName) return null;

  const vendors = await loadCompatVendors();
  const vendorId = Number(payload?.vendor_id);
  let vendorKey = existing?.vendorKey ?? null;
  if (Number.isFinite(vendorId) && vendorId > 0) {
    vendorKey = vendors[vendorId - 1]?.id ?? null;
  } else if (payload && Object.prototype.hasOwnProperty.call(payload, 'vendor_id') && !payload.vendor_id) {
    vendorKey = null;
  }

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `model_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    modelName,
    description:
      typeof payload?.description === 'string'
        ? payload.description
        : existing?.description ?? '',
    icon:
      typeof payload?.icon === 'string'
        ? payload.icon
        : existing?.icon ?? '',
    tags:
      typeof payload?.tags === 'string'
        ? payload.tags
        : existing?.tags ?? '',
    vendorKey,
    endpoints:
      typeof payload?.endpoints === 'string'
        ? payload.endpoints
        : existing?.endpoints ?? '',
    status:
      Number.isFinite(Number(payload?.status)) ? Number(payload.status) : existing?.status ?? 1,
    syncOfficial:
      Number.isFinite(Number(payload?.sync_official))
        ? Number(payload.sync_official)
        : existing?.syncOfficial ?? 1,
    nameRule:
      Number.isFinite(Number(payload?.name_rule)) ? Number(payload.name_rule) : existing?.nameRule ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createPrefillGroupRecord(
  payload: any,
  existing?: PrefillGroupData
): PrefillGroupData | null {
  const type =
    payload?.type === 'model' || payload?.type === 'tag' || payload?.type === 'endpoint'
      ? payload.type
      : existing?.type;
  const name =
    typeof payload?.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : existing?.name ?? '';
  if (!type || !name) return null;

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `prefill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    type,
    items: normalizeItems(payload?.items ?? existing?.items ?? []),
    description:
      typeof payload?.description === 'string'
        ? payload.description
        : existing?.description ?? '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function filterModelStatus(status: number, filter: string) {
  if (!filter || filter === 'all') return true;
  if (filter === 'enabled' || filter === '1') return status === 1;
  if (filter === 'disabled' || filter === '0') return status !== 1;
  return true;
}

export function filterSyncStatus(syncOfficial: number, filter: string) {
  if (!filter || filter === 'all') return true;
  if (filter === 'yes' || filter === '1') return syncOfficial === 1;
  if (filter === 'no' || filter === '0') return syncOfficial !== 1;
  return true;
}

export function buildVendorCounts(items: Array<{ vendor_id?: number }>) {
  return items.reduce<Record<string, number>>(
    (acc, item) => {
      acc.all += 1;
      if (typeof item.vendor_id === 'number') {
        acc[String(item.vendor_id)] = (acc[String(item.vendor_id)] ?? 0) + 1;
      }
      return acc;
    },
    { all: 0 }
  );
}

export async function getMissingModelNames() {
  const [models, channels] = await Promise.all([loadCompatModels(), loadCompatChannels()]);
  const configured = new Set(models.map((model) => model.modelName));
  const used = uniqueStrings(channels.flatMap((channel) => splitCsv(channel.models)));
  return used.filter((name) => !configured.has(name)).sort((a, b) => a.localeCompare(b));
}

export async function saveCompatVendor(record: CompatVendorData) {
  await redis.hset(VENDORS_KEY, { [record.id]: JSON.stringify(record) });
}

export async function saveCompatModel(record: CompatModelData) {
  await redis.hset(MODELS_KEY, { [record.id]: JSON.stringify(record) });
}

export async function savePrefillGroup(record: PrefillGroupData) {
  await redis.hset(PREFILL_GROUPS_KEY, { [record.id]: JSON.stringify(record) });
}

export async function deleteCompatVendor(key: string) {
  await redis.hdel(VENDORS_KEY, key);
}

export async function deleteCompatModel(key: string) {
  await redis.hdel(MODELS_KEY, key);
}

export async function deletePrefillGroup(key: string) {
  await redis.hdel(PREFILL_GROUPS_KEY, key);
}
