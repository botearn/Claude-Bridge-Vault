import { Redis } from '@upstash/redis'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'vault_session'
const redis = Redis.fromEnv()

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

function includesLike(value: string | undefined, needle: string) {
  return value?.toLowerCase().includes(needle.toLowerCase()) ?? false
}

function toUnixSeconds(value?: string | null) {
  if (!value) return 0
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : 0
}

type Session = {
  userId: string
  email: string
  name: string
  role: 'admin' | 'user'
}

type SubKeyData = {
  name: string
  vendor: 'claude' | 'tokenutopia' | 'palebluedot' | 'clawos' | 'clawos-overseas' | 'amazon'
  group?: string
  scope?: 'internal' | 'external'
  userId?: string
  usage: number
  inputTokens?: number
  outputTokens?: number
  totalQuota?: number | null
  expiresAt?: string | null
  createdAt?: string
  lastUsed?: string | null
}

export async function requireSession(req: any): Promise<Session | null> {
  const cookies = parseCookie(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as Session
  } catch {
    return null
  }
}

export function unauthorized(res: any) {
  return json(res, 401, { success: false, message: 'Unauthorized' })
}

async function loadTokens() {
  const raw = ((await redis.hgetall('vault:subkeys')) ?? {}) as Record<
    string,
    unknown
  >
  return Object.entries(raw)
    .map(([storedKey, value]) => {
      const parsed = parseStored<SubKeyData>(value)
      return parsed ? { storedKey, key: parsed } : null
    })
    .filter(
      (
        item
      ): item is { storedKey: string; key: SubKeyData } => item !== null
    )
}

async function getTokenById(id: number) {
  const index = id - 1
  if (index < 0) return null
  const tokens = await loadTokens()
  return tokens[index] ? { index, token: tokens[index] } : null
}

function mapToken(
  storedKey: string,
  key: SubKeyData,
  index: number,
  isAdmin: boolean,
  session: Session
) {
  if (!isAdmin && key.userId !== session.userId) {
    return null
  }

  const usedQuota = (key.inputTokens || 0) + (key.outputTokens || 0)
  const totalQuota = key.totalQuota || 0
  const expired = key.expiresAt
    ? new Date(key.expiresAt).getTime() < Date.now()
    : false
  const exhausted = key.totalQuota != null && usedQuota >= key.totalQuota
  const remainQuota =
    key.totalQuota == null ? 0 : Math.max(0, totalQuota - usedQuota)

  return {
    id: index + 1,
    name: key.name,
    key: storedKey,
    status: expired ? 3 : exhausted ? 4 : 1,
    remain_quota: remainQuota,
    used_quota: usedQuota,
    unlimited_quota: key.totalQuota == null,
    expired_time: key.expiresAt ? toUnixSeconds(key.expiresAt) : -1,
    created_time: toUnixSeconds(key.createdAt),
    accessed_time: key.lastUsed ? toUnixSeconds(key.lastUsed) : 0,
    group: key.group ?? '',
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
  }
}

function mapCompatDetail(
  storedKey: string,
  key: SubKeyData,
  index: number,
  isAdmin: boolean,
  session: Session
) {
  const mapped = mapToken(storedKey, key, index, isAdmin, session)
  if (!mapped) return null

  return {
    ...mapped,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
  }
}

export async function handleTokenList(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const url = new URL(req.url, `https://${req.headers.host || 'console-app.local'}`)
  const page = Math.max(1, parseInt(url.searchParams.get('p') ?? '1', 10) || 1)
  const pageSize = Math.max(
    1,
    parseInt(url.searchParams.get('size') ?? '10', 10) || 10
  )
  const isAdmin = session.role === 'admin'

  const items = (await loadTokens())
    .map(({ storedKey, key }, idx) =>
      mapToken(storedKey, key, idx, isAdmin, session)
    )
    .filter((item) => item !== null)

  const start = (page - 1) * pageSize
  return json(res, 200, {
    success: true,
    data: {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      page_size: pageSize,
    },
  })
}

export async function handleTokenSearch(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const url = new URL(req.url, `https://${req.headers.host || 'console-app.local'}`)
  const keyword = url.searchParams.get('keyword')?.trim() ?? ''
  const tokenQuery = url.searchParams.get('token')?.trim() ?? ''
  const isAdmin = session.role === 'admin'

  const items = (await loadTokens())
    .map(({ storedKey, key }, index) =>
      mapToken(storedKey, key, index, isAdmin, session)
    )
    .filter((item) => item !== null)
    .filter((item) => {
      if (keyword && !includesLike(item.name, keyword)) return false
      if (tokenQuery && !includesLike(item.key, tokenQuery)) return false
      return true
    })

  return json(res, 200, {
    success: true,
    data: items,
  })
}

export async function handleTokenGet(req: any, res: any, id: number) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const entry = await getTokenById(id)
  if (!entry) {
    return json(res, 404, { success: false, message: 'Token not found' })
  }

  const isAdmin = session.role === 'admin'
  const item = mapCompatDetail(
    entry.token.storedKey,
    entry.token.key,
    entry.index,
    isAdmin,
    session
  )

  if (!item) return unauthorized(res)
  return json(res, 200, { success: true, data: item })
}

export async function handleTokenDelete(req: any, res: any, id: number) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const entry = await getTokenById(id)
  if (!entry) {
    return json(res, 404, { success: false, message: 'Token not found' })
  }

  if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
    return unauthorized(res)
  }

  await redis.hdel('vault:subkeys', entry.token.storedKey)
  return json(res, 200, { success: true, message: 'OK' })
}

export async function handleTokenKey(req: any, res: any, id: number) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const entry = await getTokenById(id)
  if (!entry) {
    return json(res, 404, { success: false, message: 'Token not found' })
  }

  if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
    return unauthorized(res)
  }

  return json(res, 200, {
    success: true,
    data: {
      key: entry.token.storedKey,
    },
  })
}

export async function handleTokenKeysBatch(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  const keys: Record<number, string> = {}

  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const entry = await getTokenById(id)
    if (!entry) continue
    if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
      continue
    }
    keys[id] = entry.token.storedKey
  }

  return json(res, 200, {
    success: true,
    data: { keys },
  })
}

export async function handleTokenBatchDelete(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  let deleted = 0

  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const entry = await getTokenById(id)
    if (!entry) continue
    if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
      continue
    }
    await redis.hdel('vault:subkeys', entry.token.storedKey)
    deleted += 1
  }

  return json(res, 200, {
    success: true,
    data: deleted,
  })
}

function payloadToRecord(
  payload: any,
  userId: string | undefined,
  existing?: SubKeyData
): SubKeyData {
  const quota = payload.unlimited_quota
    ? null
    : Number.isFinite(Number(payload.remain_quota))
      ? Math.max(0, Math.floor(Number(payload.remain_quota)))
      : existing?.totalQuota ?? null

  const usedTokens = (existing?.inputTokens || 0) + (existing?.outputTokens || 0)
  const totalQuota =
    quota == null ? null : Math.max(usedTokens, quota + usedTokens)

  const expiresAt =
    Number(payload.expired_time) > 0
      ? new Date(Number(payload.expired_time) * 1000).toISOString()
      : null

  return {
    vendor: existing?.vendor ?? 'amazon',
    scope: existing?.scope ?? 'internal',
    usage: existing?.usage ?? 0,
    inputTokens: existing?.inputTokens ?? 0,
    outputTokens: existing?.outputTokens ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastUsed: existing?.lastUsed ?? null,
    userId: existing?.userId ?? userId,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : existing?.name ?? 'default',
    group:
      typeof payload.group === 'string' && payload.group.trim()
        ? payload.group.trim()
        : existing?.group ?? 'default',
    totalQuota,
    expiresAt,
  }
}

export async function handleTokenCreate(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const record = payloadToRecord(req.body ?? {}, session.userId)
  const randomId = Math.random().toString(36).substring(2, 10)
  const subKey = `sk-vault-${record.vendor}-${randomId}`

  await redis.hset('vault:subkeys', {
    [subKey]: JSON.stringify(record),
  })

  const tokens = await loadTokens()
  const index = tokens.findIndex((item) => item.storedKey === subKey)
  const item = mapCompatDetail(subKey, record, index, true, session)

  return json(res, 200, {
    success: true,
    data: item,
  })
}

export async function handleTokenUpdate(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const id = Number(req.body?.id)
  if (!Number.isFinite(id)) {
    return json(res, 400, { success: false, message: 'Invalid token id' })
  }

  const entry = await getTokenById(id)
  if (!entry) {
    return json(res, 404, { success: false, message: 'Token not found' })
  }

  if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
    return unauthorized(res)
  }

  const next = payloadToRecord(req.body ?? {}, entry.token.key.userId, entry.token.key)
  await redis.hset('vault:subkeys', {
    [entry.token.storedKey]: JSON.stringify(next),
  })

  const item = mapCompatDetail(
    entry.token.storedKey,
    next,
    entry.index,
    true,
    session
  )

  return json(res, 200, {
    success: true,
    data: item,
  })
}

export async function handleTokenStatusUpdate(req: any, res: any) {
  const session = await requireSession(req)
  if (!session) return unauthorized(res)

  const id = Number(req.body?.id)
  if (!Number.isFinite(id)) {
    return json(res, 400, { success: false, message: 'Invalid token id' })
  }

  const entry = await getTokenById(id)
  if (!entry) {
    return json(res, 404, { success: false, message: 'Token not found' })
  }

  if (session.role !== 'admin' && entry.token.key.userId !== session.userId) {
    return unauthorized(res)
  }

  const status = Number(req.body?.status)
  const next: SubKeyData = {
    ...entry.token.key,
    expiresAt:
      status === 2 ? new Date(0).toISOString() : entry.token.key.expiresAt,
  }

  await redis.hset('vault:subkeys', {
    [entry.token.storedKey]: JSON.stringify(next),
  })

  const item = mapCompatDetail(
    entry.token.storedKey,
    next,
    entry.index,
    true,
    session
  )

  return json(res, 200, {
    success: true,
    data: item,
  })
}
