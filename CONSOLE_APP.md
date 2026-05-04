# Console App

`console-app/` is a forked standalone frontend from `QuantumNous/new-api` `web/default`.

It is intentionally separate from the current Next.js `vault` app.

## Run

1. Install dependencies

```bash
npm run console:install
```

2. Start the console frontend

```bash
npm run console:dev
```

By default, the console frontend proxies `/api`, `/mj`, and `/pg` to:

```bash
http://localhost:3000
```

That means:

- keep the current Next.js app running on `3000`
- run `console-app` on its own dev port

## Access

- local console URL: `http://localhost:3001`
- Next route `/console` now redirects to the standalone console app
- optional override: set `NEXT_PUBLIC_CONSOLE_APP_URL` if the console app is hosted elsewhere

## Separation

- `vault/Next app`: user-facing frontend
- `console-app/`: internal admin console fork

Do not treat `console-app` as a page inside the Next.js app. It is a separate frontend application.
