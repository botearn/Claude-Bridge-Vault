import { Redis } from '@upstash/redis'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'vault_session'
const redis = Redis.fromEnv()

const VENDOR_CHANNEL_MAP: Record<string, number> = {
  claude: 14,
  amazon: 3,
  clawos: 1,
  'clawos-overseas': 1,
  tokenutopia: 1,
  palebluedot: 1,
}

function getSecret() {
  const raw = process.env.JWT_SECRET || process.env.ADMIN_SECRET
  if (!raw) throw new Error('JWT_SECRET or ADMIN_SECRET must be set')
  return new TextEncoder().encode(raw)
}

function parseCookie(header = '') {
  return header
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const idx = item.indexOf('=')
      if (idx <= 0) return acc
      acc[item.slice(0, idx)] = decodeURIComponent(item.slice(idx + 1))
      return acc
    }, {})
}

function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

function includesLike(value: string | undefined, needle: string) {
  return value?.toLowerCase().includes(needle.toLowerCase()) ?? false
}

function toUnixSeconds(value?: string) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : 0
}

function parseStored<T>(value: unknown): T | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value as T
}

export async function requireSession(req: any) {
  const cookies = parseCookie(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as {
      userId: string
      email: string
      name: string
      role: 'admin' | 'user'
    }
  } catch {
    return null
  }
}

async function loadUsageEntries() {
  const raw = (await redis.lrange('vault:usage:logs', 0, 4999)) as unknown[]
  return raw
    .map((item) => parseStored<Record<string, unknown>>(item))
    .filter((item): item is Record<string, unknown> => item !== null)
}

async function loadUsers() {
  const raw = ((await redis.hgetall('vault:users')) ?? {}) as Record<string, unknown>
  return Object.values(raw)
    .map((item) => parseStored<Record<string, unknown>>(item))
    .filter((item): item is Record<string, unknown> => item !== null)
}

async function loadTokens() {
  const raw = ((await redis.hgetall('vault:subkeys')) ?? {}) as Record<string, unknown>
  return Object.entries(raw)
    .map(([storedKey, value]) => {
      const parsed = parseStored<Record<string, unknown>>(value)
      return parsed ? { storedKey, key: parsed } : null
    })
    .filter(
      (
        item
      ): item is { storedKey: string; key: Record<string, unknown> } => item !== null
    )
}

function parseQuery(req: any) {
  const url = new URL(req.url, `https://${req.headers.host || 'console-app.local'}`)
  const page = Math.max(1, parseInt(url.searchParams.get('p') ?? '1', 10) || 1)
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('page_size') ?? '20', 10) || 20)
  )

  return {
    page,
    pageSize,
    type:
      url.searchParams.get('type') != null
        ? parseInt(url.searchParams.get('type') || '', 10)
        : undefined,
    username: url.searchParams.get('username') ?? undefined,
    tokenName: url.searchParams.get('token_name') ?? undefined,
    modelName: url.searchParams.get('model_name') ?? undefined,
    startTimestamp:
      url.searchParams.get('start_timestamp') != null
        ? parseInt(url.searchParams.get('start_timestamp') || '', 10)
        : undefined,
    endTimestamp:
      url.searchParams.get('end_timestamp') != null
        ? parseInt(url.searchParams.get('end_timestamp') || '', 10)
        : undefined,
    channel:
      url.searchParams.get('channel') != null
        ? parseInt(url.searchParams.get('channel') || '', 10)
        : undefined,
    group: url.searchParams.get('group') ?? undefined,
    requestId: url.searchParams.get('request_id') ?? undefined,
  }
}

async function buildLogs(session: {
  userId: string
  role: 'admin' | 'user'
}) {
  const [entries, users, tokens] = await Promise.all([
    loadUsageEntries(),
    loadUsers(),
    loadTokens(),
  ])

  const userById = new Map(users.map((user) => [String(user.id ?? ''), user]))
  const tokenBySuffix = new Map(tokens.map((token) => [token.storedKey.slice(-8), token]))

  const visibleEntries =
    session.role === 'admin'
      ? entries
      : entries.filter((entry) => String(entry.userId ?? '') === session.userId)

  return visibleEntries.map((entry, index) => {
    const subKey = String(entry.subKey ?? '')
    const token = tokenBySuffix.get(subKey)
    const userId = String(entry.userId ?? '')
    const user = userById.get(userId)
    const createdAt = toUnixSeconds(String(entry.timestamp ?? ''))
    const status = String(entry.status ?? 'success')
    const vendor = String(entry.vendor ?? '')
    const group = String(entry.group ?? token?.key.group ?? '')
    const tokenName = String(entry.tokenName ?? token?.key.name ?? subKey)
    const requestPath = entry.requestPath ? String(entry.requestPath) : undefined
    const sourcePath = entry.sourcePath ? String(entry.sourcePath) : undefined
    const errorCode =
      typeof entry.errorCode === 'number' ? entry.errorCode : undefined
    const contentParts = []
    if (sourcePath) contentParts.push(`Source ${sourcePath}`)
    if (requestPath) contentParts.push(requestPath)
    if (status === 'error') {
      contentParts.push(errorCode ? `HTTP ${errorCode}` : 'Proxy Error')
    }

    return {
      id: index + 1,
      user_id: Number(userId) || 0,
      created_at: createdAt,
      type: status === 'error' ? 5 : 2,
      content: contentParts.join(' · ') || 'Vault API call',
      username: String(user?.email ?? ''),
      token_name: tokenName,
      model_name: String(entry.model ?? ''),
      quota: Number(entry.costUsd ?? 0),
      prompt_tokens: Number(entry.inputTokens ?? 0),
      completion_tokens: Number(entry.outputTokens ?? 0),
      use_time: Math.max(0, Number(entry.latencyMs ?? 0) / 1000),
      is_stream: entry.stream === true,
      channel: VENDOR_CHANNEL_MAP[vendor] ?? 0,
      channel_name: vendor,
      token_id: 0,
      group,
      ip: '',
      other: JSON.stringify({
        group,
        request_path: requestPath,
        request_source: sourcePath,
        admin_info: {
          local_count_tokens: true,
        },
        ...(status === 'error'
          ? {
              stream_status: {
                status: 'error',
                end_reason: errorCode ? `HTTP ${errorCode}` : 'proxy_error',
              },
            }
          : {}),
      }),
      request_id: `${createdAt}-${vendor}-${subKey}-${index + 1}`,
    }
  })
}

function filterLogs(logs: any[], query: ReturnType<typeof parseQuery>) {
  return logs.filter((log) => {
    if (query.type != null && log.type !== query.type) return false
    if (query.channel != null && query.channel !== 0 && log.channel !== query.channel)
      return false
    if (query.startTimestamp != null && log.created_at < query.startTimestamp)
      return false
    if (query.endTimestamp != null && log.created_at > query.endTimestamp) return false
    if (query.username && !includesLike(log.username, query.username)) return false
    if (query.tokenName && !includesLike(log.token_name, query.tokenName)) return false
    if (query.modelName && !includesLike(log.model_name, query.modelName)) return false
    if (query.group && !includesLike(log.group, query.group)) return false
    if (query.requestId && !includesLike(log.request_id, query.requestId)) return false
    return true
  })
}

export async function handleLogList(req: any, res: any, adminOnly: boolean) {
  const session = await requireSession(req)
  if (!session) return json(res, 401, { success: false, message: 'Unauthorized' })
  if (adminOnly && session.role !== 'admin') {
    return json(res, 401, { success: false, message: 'Unauthorized' })
  }

  const query = parseQuery(req)
  const filtered = filterLogs(await buildLogs(session), query)
  const start = (query.page - 1) * query.pageSize

  return json(res, 200, {
    success: true,
    message: 'OK',
    data: {
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      page: query.page,
      page_size: query.pageSize,
    },
  })
}

export async function handleLogStats(req: any, res: any, adminOnly: boolean) {
  const session = await requireSession(req)
  if (!session) return json(res, 401, { success: false, message: 'Unauthorized' })
  if (adminOnly && session.role !== 'admin') {
    return json(res, 401, { success: false, message: 'Unauthorized' })
  }

  const query = parseQuery(req)
  const filtered = filterLogs(await buildLogs(session), query)
  const minuteCutoff = Math.floor(Date.now() / 1000) - 60
  const recent = filtered.filter((log) => log.created_at >= minuteCutoff)

  return json(res, 200, {
    success: true,
    message: 'OK',
    data: {
      quota: filtered.reduce((sum, log) => sum + Number(log.quota || 0), 0),
      rpm: recent.length,
      tpm: recent.reduce(
        (sum, log) =>
          sum + Number(log.prompt_tokens || 0) + Number(log.completion_tokens || 0),
        0
      ),
    },
  })
}
