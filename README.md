# Token Bank

A multi-vendor API gateway + dashboard that issues **Sub-Keys** (e.g. `sk-vault-...`) to proxy requests to upstream AI vendors (Claude / YourAgent / Yunwu).

- Dashboard to create/manage keys, groups, quota & expiry
- Proxy endpoints that accept Sub-Keys and forward to upstream vendor APIs
- Usage tracking (calls, tokens, cost) with per-key daily breakdown
- Internal / External scope separation
- Collapsible sidebar navigation

**Live:** [https://www.sitesfy.run](https://www.sitesfy.run)

---

## Supported Vendors & Proxy Endpoints

| Vendor | Proxy Path | Auth Header | Format |
|--------|-----------|-------------|--------|
| YourAgent | `/api/v1/youragent` | `x-api-key` | Anthropic Messages |
| Claude | `/api/v1/claude` | `x-api-key` | Anthropic Messages |
| Yunwu | `/api/v1/yunwu` | `x-api-key` | OpenAI Chat Completions |

---

## Environment Variables

Create `.env.local`:

```bash
# Admin Auth (required)
ADMIN_SECRET=your_secret_here

# Upstash Redis (required)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Vendor master keys (required for proxying)
YOURAGENT_MASTER_KEY=...
CLAUDE_MASTER_KEY=...
YUNWU_MASTER_KEY=...

# Optional
NEXT_PUBLIC_BASE_URL=https://www.sitesfy.run
WEBHOOK_URL=...
FEISHU_WEBHOOK_URL=...
```

---

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## API Usage Examples

### YourAgent / Claude (Anthropic format)

```bash
curl https://www.sitesfy.run/api/v1/youragent \
  -H "x-api-key: sk-vault-youragent-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-opus-4-6","max_tokens":128,"messages":[{"role":"user","content":"Hello"}]}'
```

### Yunwu (OpenAI-compatible)

```bash
curl https://www.sitesfy.run/api/v1/yunwu \
  -H "x-api-key: sk-vault-yunwu-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Key Features

- **Scope**: Internal / External key separation
- **Quota**: Token-based quota per key (`totalQuota`)
- **Expiry**: Date-based key expiry (`expiresAt`)
- **Rate Limiting**: 20 requests per 60-second sliding window per key
- **Master Key Rotation**: Round-robin + auto-failover on 401/429/5xx
- **Cost Tracking**: Per-vendor pricing (Claude official, YourAgent 4%, OpenAI for Yunwu)
- **Per-Key Daily Stats**: `vault:daily:keys:{date}` with 35-day TTL
- **Webhook**: Feishu + generic webhook on quota/expiry events
- **i18n**: English / Chinese toggle

---

## Pages

| Path | Description |
|------|-------------|
| `/vault` | Dashboard — manage keys by vendor & group |
| `/analytics` | Calls, tokens, cost, key health, daily breakdown |
| `/monitoring` | Real-time event log & YourAgent sync |
| `/settings` | Edit key details, manage groups |
| `/query` | Single key lookup with usage history |
| `/docs` | API documentation |

---

## License

MIT
