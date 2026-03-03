# Claude Bridge Vault

A multi-vendor API gateway + dashboard that issues **Sub-Keys** (e.g. `sk-vault-...`) to proxy requests to upstream AI vendors (Claude / YourAgent / OpenAI / Gemini).

- Dashboard to create/manage keys, groups, quota & expiry
- Proxy endpoints that accept Sub-Keys and forward to upstream vendor APIs
- Usage tracking (calls) and **token/cost estimate** (best-effort)

---

## Quick Links

- Dashboard: `/`
- Docs: `/docs`
- Settings: `/settings`
- Key Lookup: `/query`

---

## How it works

1. You create a Sub-Key in the dashboard.
2. Client calls `POST /api/v1/{vendor}` with header `x-api-key: <subKey>`.
3. Server verifies the Sub-Key in Redis (`vault:subkeys`).
4. Server forwards the request to the vendor upstream using a **master key** stored in environment variables.
5. On successful calls, the server updates:
   - `usage` (+1)
   - `lastUsed`
   - `inputTokens/outputTokens` (if upstream returns usage)
   - `costUsd` (estimated)

---

## Supported Vendors & Proxy Endpoints

| Vendor | Proxy Path | Client Auth Header |
|------|-----------|--------------------|
| YourAgent | `/api/v1/youragent` | `x-api-key: <subKey>` |
| Claude | `/api/v1/claude` | `x-api-key: <subKey>` |
| OpenAI | `/api/v1/openai` | `x-api-key: <subKey>` |
| Gemini | `/api/v1/gemini` | `x-api-key: <subKey>` |

> Note: For Gemini we proxy to Google Generative Language API.

### Proxy API behavior

`POST /api/v1/{vendor}` is a thin proxy that:

- **Validates** `vendor` is one of: `claude`, `youragent`, `openai`, `gemini`.
- **Authenticates** using header `x-api-key: <subKey>` (Sub-Key must exist in Redis hash `vault:subkeys` and must match the requested vendor).
- **Checks quota/expiry**:
  - `expiresAt` (if set) must be in the future
  - `totalQuota` (if set) blocks when `usage >= totalQuota`
- **Forwards** the JSON body to the upstream vendor using the corresponding master key (`${VENDOR}_MASTER_KEY`).
- **Tracks usage on success** (only when upstream returns `2xx`):
  - `usage` increments by `+1`
  - `lastUsed` set to now
  - `inputTokens`/`outputTokens` and `costUsd` best-effort (when upstream returns usage)

#### Proxy API status codes

- `404` unknown vendor
- `401` missing `x-api-key`
- `403` invalid key / vendor mismatch / key expired
- `429` quota exceeded
- `500` service misconfigured (missing master key) or proxy error

---

## Environment Variables

Create `.env.local`:

```bash
# Upstash Redis (required)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Vendor master keys (required for proxying)
YOURAGENT_MASTER_KEY=...
CLAUDE_MASTER_KEY=...
OPENAI_MASTER_KEY=...
GEMINI_MASTER_KEY=...

# Optional (used for ShareSnippet base URL in some server contexts)
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

---

## Local Development

```bash
npm install
npm run dev
```

Open:

- http://localhost:3000

---

## API Usage Examples

### YourAgent (Anthropic-compatible)

```bash
curl http://localhost:3000/api/v1/youragent \
  -H "x-api-key: sk-vault-youragent-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-opus-4-6","max_tokens":128,"messages":[{"role":"user","content":"Hello"}]}'
```

### Claude Official (Anthropic)

```bash
curl http://localhost:3000/api/v1/claude \
  -H "x-api-key: sk-vault-claude-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-5-sonnet-latest","max_tokens":128,"messages":[{"role":"user","content":"Hello"}]}'
```

### OpenAI (Chat Completions)

```bash
curl http://localhost:3000/api/v1/openai \
  -H "x-api-key: sk-vault-openai-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

### Gemini

```bash
curl http://localhost:3000/api/v1/gemini \
  -H "x-api-key: sk-vault-gemini-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-pro","contents":[{"parts":[{"text":"Hello"}]}]}'
```

---

## Key Management API (Internal)

These endpoints are used by the dashboard UI to manage Sub-Keys and Groups stored in Redis.

### List keys

```bash
curl "http://localhost:3000/api/v1/manage/keys?vendor=youragent&group=1"
```

Response is a JSON object mapping `subKey -> keyData`.

### Create key

```bash
curl -X POST http://localhost:3000/api/v1/manage/keys \
  -H "Content-Type: application/json" \
  -d '{"name":"my-key","vendor":"youragent","group":"1","totalQuota":100,"expiresAt":null}'
```

### Update key

```bash
curl -X PATCH http://localhost:3000/api/v1/manage/keys/sk-vault-youragent-xxxxxxxx \
  -H "Content-Type: application/json" \
  -d '{"name":"new-name","group":"1","totalQuota":200,"expiresAt":null}'
```

### Delete key

```bash
curl -X DELETE http://localhost:3000/api/v1/manage/keys \
  -H "Content-Type: application/json" \
  -d '{"subKey":"sk-vault-youragent-xxxxxxxx"}'
```

### Groups

```bash
# List
curl "http://localhost:3000/api/v1/manage/groups?vendor=youragent"

# Create
curl -X POST http://localhost:3000/api/v1/manage/groups \
  -H "Content-Type: application/json" \
  -d '{"vendor":"youragent","groupId":"1","label":"Default"}'

# Update
curl -X PATCH http://localhost:3000/api/v1/manage/groups \
  -H "Content-Type: application/json" \
  -d '{"key":"youragent:1","label":"New Label"}'

# Delete
curl -X DELETE http://localhost:3000/api/v1/manage/groups \
  -H "Content-Type: application/json" \
  -d '{"key":"youragent:1"}'
```

### Key lookup (single key)

```bash
curl "http://localhost:3000/api/v1/manage/keys/sk-vault-youragent-xxxxxxxx"
```

Returns a `SubKeyRecord` containing `baseUrl` (computed from `NEXT_PUBLIC_BASE_URL` + vendor base path).

### One-time migration

```bash
curl -X POST http://localhost:3000/api/v1/manage/migrate \
  -H "x-migration-secret: <MIGRATION_SECRET>"
```

This migrates old Redis hash `vault_subkeys` to `vault:subkeys`. Protected by `MIGRATION_SECRET`.

---

## Admin Auth API (Dashboard)

Dashboard pages are protected by a cookie (`vault_admin`). Use these endpoints to log in/out.

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<ADMIN_SECRET>"}'
```

### Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout
```

---

## Usage & Billing Notes

- `usage` increments by **1 per successful proxy request**.
- `inputTokens/outputTokens` are extracted from upstream responses when available.
- `costUsd` is **estimated**.

### YourAgent budget & comparison

- The dashboard shows a **$20 budget** for `YOURAGENT_MASTER_KEY`.
- YourAgent estimated cost is modeled as **4% of Claude Official** for the same token usage.

> If you change pricing rules, you may want to reset existing counters in Redis to avoid mixing old/new estimates.

---

# 中文说明（Chinese)

Claude Bridge Vault 是一个多厂商 AI API 网关 + 管理后台，通过 **子密钥（Sub-Key）** 的方式，统一代理调用多家上游（Claude / YourAgent / OpenAI / Gemini），并提供配额、过期、分组、用量统计与费用估算。

## 页面路由

- 仪表盘：`/`
- 文档：`/docs`
- 设置：`/settings`
- 密钥查询：`/query`

## 工作流程

1. 在仪表盘创建 Sub-Key（形如 `sk-vault-...`）。
2. 调用 `POST /api/v1/{vendor}`，用请求头 `x-api-key: <subKey>` 做鉴权。
3. 服务端从 Redis 校验 Sub-Key，并用环境变量中的 master key 转发到上游。
4. 代理成功后更新：调用次数、最近使用时间、Tokens（如上游返回 usage）、费用估算。

## 环境变量

在 `.env.local` 配置：

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

YOURAGENT_MASTER_KEY=...
CLAUDE_MASTER_KEY=...
OPENAI_MASTER_KEY=...
GEMINI_MASTER_KEY=...

NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

## 本地启动

```bash
npm install
npm run dev
```

## API 调用示例

- YourAgent / Claude 使用 Anthropic 兼容的 `messages` 格式（详见 `/docs`）。
- OpenAI 使用 `chat/completions`。
- Gemini 走 Google Generative Language API。

## API 说明（更完整）

### 代理接口（Proxy）

`POST /api/v1/{vendor}`

- **vendor**：`claude` / `youragent` / `openai` / `gemini`
- **鉴权**：统一使用 `x-api-key: <subKey>`（Sub-Key 存在于 Redis 的 `vault:subkeys`，并且 vendor 必须匹配）
- **配额/过期**：
  - 设置了 `expiresAt` 时，过期返回 `403`
  - 设置了 `totalQuota` 时，达到 `usage >= totalQuota` 返回 `429`
- **转发**：使用 `${VENDOR}_MASTER_KEY` 转发到上游
- **成功后计费/统计**（仅上游 `2xx` 时更新）：`usage +1`、`lastUsed`、tokens 与 `costUsd`（尽力估算）

常见状态码：`401` 缺少 key，`403` key 无效/不匹配/过期，`429` 超配额，`500` 配置错误或代理异常。

### 管理接口（Internal）

- `GET /api/v1/manage/keys?vendor=...&group=...`：列出 keys
- `POST /api/v1/manage/keys`：创建 key
- `PATCH /api/v1/manage/keys/{subKey}`：更新 key
- `DELETE /api/v1/manage/keys`：删除 key
- `GET/POST/PATCH/DELETE /api/v1/manage/groups`：分组管理
- `GET /api/v1/manage/keys/{subKey}`：查询单个 key（会返回 `baseUrl`）
- `POST /api/v1/manage/migrate`：一次性迁移（需要 `x-migration-secret`）

### 后台登录/登出

- `POST /api/auth/login`：传 `{ password: ADMIN_SECRET }`，设置 `vault_admin` cookie
- `POST /api/auth/logout`：清除 cookie

## 用量与费用

- `usage`：每次代理成功 +1
- `inputTokens/outputTokens`：尽可能从上游返回中提取
- `costUsd`：费用为估算值

### YourAgent 预算与对比

- `YOURAGENT_MASTER_KEY` 的预算上限：**$20**
- 同等 Tokens 用量下，YourAgent 价格按 **官方 Claude 的 4%** 估算

---

## License

MIT (or specify your license)
