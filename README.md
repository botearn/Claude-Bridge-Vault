# Claude Bridge Vault

Multi-vendor API key management platform. Users register, top up balance, create API keys (one key = one model), and get billed per call.

**Live:** [https://www.sitesfy.run](https://www.sitesfy.run)

---

## Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Storage**: Upstash Redis
- **Payments**: Stripe
- **Deploy**: Vercel

---

## Features

### For Users
- Register / login (JWT session, 30-day cookie)
- Top up balance via Stripe
- Create API keys — pick a model, give it a name, done
- One key = one model (Claude, GPT-4, Gemini, Grok, DeepSeek, etc.)
- Usage billed per call, deducted from balance
- See call count, token usage, and estimated cost per key

### For Admins
- All of the above, plus:
- Filter keys by vendor (Claude / TokenUtopia / Yunwu) and scope (Internal / External)
- Analytics page: call trends, vendor distribution, key health, latency percentiles
- Manual balance top-up for any user by email
- Per-key daily usage breakdown
- **Vendor Accounts vault**: record third-party token purchase info (API endpoint, website, credentials, notes) with AES-256-GCM encryption at rest and a separate page password gate

---

## Auth

- Email/password registration + login
- Google OAuth (one-click sign in / sign up)
- First registered user automatically gets `role: 'admin'`; all subsequent users get `role: 'user'`
- Session: HS256 JWT signed with `JWT_SECRET`, 30-day expiry, stored in `httpOnly` cookie
- Google users auto-created on first login (no password set)

---

## User Data Isolation

Non-admin users only see and can modify their own keys. Enforced server-side on all API routes (GET, DELETE, PATCH) by matching `userId` from the session cookie against the key's stored `userId`. Admins have full visibility.

---

## Vendors

| Vendor | Endpoint | Auth Style | Models |
|--------|----------|------------|--------|
| `claude` | api.anthropic.com | x-api-key | Claude (official) |
| `tokenutopia` | tokenutopia.ai | x-api-key | Claude (via TokenUtopia) |
| `yunwu` | yunwu.ai | Bearer | Claude, GPT-4, Gemini, Grok, DeepSeek |

Users select a vendor when creating a key, then pick a model from that vendor's catalog.

---

## Pricing

All usage is billed at **1:1 upstream API official pricing** (no markup). Cost is calculated per request based on actual token consumption:

```
cost = (inputTokens / 1,000,000) × inputPrice + (outputTokens / 1,000,000) × outputPrice
```

### Claude / TokenUtopia (USD per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| Claude Opus 4.6 | $15.00 | $75.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $0.80 | $4.00 |

### Yunwu — OpenAI (USD per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| GPT-4.1 | $2.00 | $8.00 |
| GPT-4.1 mini | $0.40 | $1.60 |
| GPT-4.1 nano | $0.10 | $0.40 |
| GPT-4o | $2.50 | $10.00 |
| GPT-4o mini | $0.15 | $0.60 |
| o3 | $10.00 | $40.00 |
| o4-mini | $1.10 | $4.40 |

### Yunwu — Google / xAI / DeepSeek (USD per 1M tokens)

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.5 Pro | $1.25 | $10.00 |
| Gemini 2.5 Flash | $0.15 | $0.60 |
| Grok 3 | $3.00 | $15.00 |
| Grok 3 mini | $0.30 | $0.50 |
| DeepSeek Chat | $0.27 | $1.10 |
| DeepSeek Reasoner | $0.55 | $2.19 |

### Billing Flow

1. User tops up balance via Stripe ($5 / $10 / $20 / $50 / $100)
2. Balance stored in Redis as micro-cents (1 USD = 1,000,000 units) for sub-cent precision
3. Each API call: proxy extracts token usage from upstream response, calculates cost, deducts from user balance atomically
4. Negative balance is allowed (pay-as-you-go, no hard cutoff)

---

## Proxy Routes

All API calls go through `/api/v1/[vendor]/...`. The proxy:

1. Looks up the sub-key in Redis
2. Checks expiry (`expiresAt`) → 403 if expired
3. Checks call quota (`usage >= totalQuota`) → 429 if exceeded
4. Checks model binding → 403 if key is bound to a different model
5. Forwards request to upstream vendor with the master key
6. On success: increments usage, records tokens + cost, deducts from owner's balance

### Usage Examples

**Claude / TokenUtopia (Anthropic format)**
```bash
curl https://www.sitesfy.run/api/v1/tokenutopia \
  -H "x-api-key: sk-vault-tokenutopia-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-opus-4-6","max_tokens":128,"messages":[{"role":"user","content":"Hello"}]}'
```

**Yunwu (OpenAI-compatible)**
```bash
curl https://www.sitesfy.run/api/v1/yunwu \
  -H "x-api-key: sk-vault-yunwu-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Redis Schema

```
vault:subkeys                    hash  key=sk-vault-{vendor}-{random}, value=SubKeyData JSON
vault:users                      hash  key=email, value=UserData JSON
vault:groups                     hash  key={vendor}:{groupId}, value={label,vendor,createdAt}
vault:settings                   hash  general settings
vault:balance:{userId}           string  balance in micro-cents (1 USD = 1,000,000 units)
vault:daily:calls:{YYYY-MM-DD}  integer  global daily call counter, TTL 35d
vault:daily:keys:{YYYY-MM-DD}   hash  per-key daily usage (calls/tokens/cost), TTL 35d
vault:usage:log                  list  recent proxy call logs (last 1000)
vault:accounts                   hash  key=acc-{id}, value=AccountRecord JSON (username/password AES-256-GCM encrypted)
```

### SubKeyData fields

```ts
{
  name: string
  vendor: 'claude' | 'tokenutopia' | 'yunwu'
  group: string
  scope: 'internal' | 'external'
  model?: string          // locked model for this key
  userId?: string         // owner — used for data isolation
  usage: number           // call count
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  createdAt: string
  lastUsed: string | null
  totalQuota: number | null   // null = unlimited
  expiresAt: string | null    // null = no expiry
  budgetUsd?: number | null   // max USD spend cap
}
```

---

## Environment Variables

```env
# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Vendor master keys (comma-separated for multiple)
CLAUDE_MASTER_KEY=
TOKENUTOPIA_MASTER_KEY=
YUNWU_MASTER_KEY=

# Auth
JWT_SECRET=

# Google OAuth (optional — enables "Continue with Google")
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Optional
NEXT_PUBLIC_BASE_URL=https://your-domain.com
MIGRATION_SECRET=    # one-time use for vault_subkeys → vault:subkeys migration
ACCOUNT_ENCRYPT_KEY= # AES key for encrypting vendor account credentials (falls back to JWT_SECRET)
ACCOUNTS_PAGE_PASSWORD= # page-level password for /accounts (default: sitesfy2026)
```

---

## Local Development

```bash
cp .env.example .env.local   # fill in your keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/vault`, login required.

---

## Pages

| Route | Description |
|-------|-------------|
| `/vault` | Main dashboard — key list, balance, create key; admin filter bar for vendor/scope |
| `/analytics` | Admin: call trends, vendor breakdown, key health, latency percentiles |
| `/settings` | Edit existing keys (name, quota, expiry) |
| `/logs` | Recent proxy call logs |
| `/playground` | Test a key inline |
| `/pricing` | Pricing page |
| `/accounts` | Admin: vendor account vault (password-protected) |
| `/login` | Login / register |

---

## Key Features

- **One key = one model**: Model is locked at creation time; vendor derived automatically
- **User isolation**: Each user only sees their own keys and usage stats
- **Quota**: Call-based or token-based quota per key (`totalQuota`)
- **Expiry**: Date-based key expiry (`expiresAt`)
- **Rate limiting**: Per-key sliding window (RPM / TPM)
- **Master key rotation**: Round-robin + auto-failover on 401/429/5xx
- **Cost tracking**: Per-vendor pricing at 1:1 upstream rates (see Pricing section)
- **i18n**: English / Chinese toggle
- **Vendor accounts**: Encrypted credential vault for third-party API providers (admin-only, page password + AES-256-GCM)
- **Admin sidebar**: Admin-only pages (Analytics, Monitoring, Channels, Accounts) hidden from non-admin users

---

## License

MIT
