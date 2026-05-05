import type { SessionPayload } from './auth';
import {
  includesLike,
  loadCompatTokens,
  loadCompatUsers,
} from './console-compat';
import { getUsageLogs, type UsageLogEntry } from './usage-log';

type CompatUsageLog = {
  id: number;
  user_id: number;
  created_at: number;
  type: number;
  content: string;
  username: string;
  token_name: string;
  model_name: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  is_stream: boolean;
  channel: number;
  channel_name: string;
  token_id: number;
  group: string;
  ip: string;
  other: string;
  request_id: string;
};

type CompatLogQuery = {
  page: number;
  pageSize: number;
  type?: number;
  username?: string;
  tokenName?: string;
  modelName?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  channel?: number;
  group?: string;
  requestId?: string;
};

const VENDOR_CHANNEL_MAP: Record<string, number> = {
  claude: 14,
  amazon: 3,
  clawos: 1,
  'clawos-overseas': 1,
  tokenutopia: 1,
  palebluedot: 1,
};

function toUnixSeconds(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : 0;
}

function parseQuery(searchParams: URLSearchParams): CompatLogQuery {
  const page = Math.max(1, parseInt(searchParams.get('p') ?? '1', 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get('page_size') ?? '20', 10) || 20),
  );
  const typeRaw = searchParams.get('type');
  const channelRaw = searchParams.get('channel');
  const startRaw = searchParams.get('start_timestamp');
  const endRaw = searchParams.get('end_timestamp');

  return {
    page,
    pageSize,
    type: typeRaw != null ? parseInt(typeRaw, 10) : undefined,
    username: searchParams.get('username') ?? undefined,
    tokenName: searchParams.get('token_name') ?? undefined,
    modelName: searchParams.get('model_name') ?? undefined,
    startTimestamp: startRaw != null ? parseInt(startRaw, 10) : undefined,
    endTimestamp: endRaw != null ? parseInt(endRaw, 10) : undefined,
    channel: channelRaw != null ? parseInt(channelRaw, 10) : undefined,
    group: searchParams.get('group') ?? undefined,
    requestId: searchParams.get('request_id') ?? undefined,
  };
}

function buildContent(entry: UsageLogEntry) {
  const parts: string[] = [];
  if (entry.sourcePath) parts.push(`Source ${entry.sourcePath}`);
  if (entry.requestPath) parts.push(entry.requestPath);
  if (entry.status === 'error') {
    parts.push(entry.errorCode ? `HTTP ${entry.errorCode}` : 'Proxy Error');
  }
  return parts.join(' · ') || 'Vault API call';
}

function buildOther(entry: UsageLogEntry, group: string) {
  const other: Record<string, unknown> = {
    group,
    admin_info: {
      local_count_tokens: true,
    },
  };

  if (entry.requestPath) other.request_path = entry.requestPath;
  if (entry.sourcePath) other.request_source = entry.sourcePath;
  if (entry.status === 'error') {
    other.stream_status = {
      status: 'error',
      end_reason: entry.errorCode ? `HTTP ${entry.errorCode}` : 'proxy_error',
    };
  }

  return JSON.stringify(other);
}

async function loadMappedLogs(session: SessionPayload, selfOnly: boolean) {
  const [entries, users, tokens] = await Promise.all([
    getUsageLogs({ limit: 5000, offset: 0 }),
    loadCompatUsers(),
    loadCompatTokens(),
  ]);

  const userById = new Map(users.map((user) => [String(user.id), user]));
  const tokenBySuffix = new Map(tokens.map((token) => [token.storedKey.slice(-8), token]));

  const visibleEntries = selfOnly
    ? entries.filter((entry) => entry.userId === session.userId)
    : session.role === 'admin'
      ? entries
      : entries.filter((entry) => entry.userId === session.userId);

  return visibleEntries.map<CompatUsageLog>((entry, index) => {
    const token = tokenBySuffix.get(entry.subKey);
    const user = entry.userId ? userById.get(String(entry.userId)) : undefined;
    const createdAt = toUnixSeconds(entry.timestamp);
    const group = entry.group ?? token?.key.group ?? '';
    const tokenName = entry.tokenName ?? token?.key.name ?? entry.subKey;
    const channel = VENDOR_CHANNEL_MAP[entry.vendor] ?? 0;
    const type = entry.status === 'error' ? 5 : 2;
    const requestId = `${createdAt}-${entry.vendor}-${entry.subKey}-${index + 1}`;

    return {
      id: index + 1,
      user_id: Number(entry.userId) || 0,
      created_at: createdAt,
      type,
      content: buildContent(entry),
      username: user?.email ?? '',
      token_name: tokenName,
      model_name: entry.model ?? '',
      quota: entry.costUsd ?? 0,
      prompt_tokens: entry.inputTokens ?? 0,
      completion_tokens: entry.outputTokens ?? 0,
      use_time: Math.max(0, (entry.latencyMs ?? 0) / 1000),
      is_stream: entry.stream === true,
      channel,
      channel_name: entry.vendor,
      token_id: token ? Number(token.key.userId) || 0 : 0,
      group,
      ip: '',
      other: buildOther(entry, group),
      request_id: requestId,
    };
  });
}

function filterLogs(logs: CompatUsageLog[], query: CompatLogQuery) {
  return logs.filter((log) => {
    if (query.type != null && log.type !== query.type) return false;
    if (query.channel != null && query.channel !== 0 && log.channel !== query.channel) return false;
    if (query.startTimestamp != null && log.created_at < query.startTimestamp) return false;
    if (query.endTimestamp != null && log.created_at > query.endTimestamp) return false;
    if (query.username && !includesLike(log.username, query.username)) return false;
    if (query.tokenName && !includesLike(log.token_name, query.tokenName)) return false;
    if (query.modelName && !includesLike(log.model_name, query.modelName)) return false;
    if (query.group && !includesLike(log.group, query.group)) return false;
    if (query.requestId && !includesLike(log.request_id, query.requestId)) return false;
    return true;
  });
}

export async function getCompatUsageLogList(
  searchParams: URLSearchParams,
  session: SessionPayload,
  selfOnly: boolean,
) {
  const query = parseQuery(searchParams);
  const logs = await loadMappedLogs(session, selfOnly);
  const filtered = filterLogs(logs, query);
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize);

  return {
    success: true,
    message: 'OK',
    data: {
      items,
      total: filtered.length,
      page: query.page,
      page_size: query.pageSize,
    },
  };
}

export async function getCompatUsageLogStats(
  searchParams: URLSearchParams,
  session: SessionPayload,
  selfOnly: boolean,
) {
  const query = parseQuery(searchParams);
  const logs = await loadMappedLogs(session, selfOnly);
  const filtered = filterLogs(logs, query);
  const minuteCutoff = Math.floor(Date.now() / 1000) - 60;
  const recent = filtered.filter((log) => log.created_at >= minuteCutoff);

  return {
    success: true,
    message: 'OK',
    data: {
      quota: filtered.reduce((sum, log) => sum + (log.quota || 0), 0),
      rpm: recent.length,
      tpm: recent.reduce(
        (sum, log) => sum + (log.prompt_tokens || 0) + (log.completion_tokens || 0),
        0,
      ),
    },
  };
}
