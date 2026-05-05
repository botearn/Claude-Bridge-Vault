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

## Deploy

Recommended production shape:

1. Deploy `console-app/` as a static site on Netlify
2. Set `VITE_REACT_APP_SERVER_URL` to the current Next.js backend origin
3. Set `NEXT_PUBLIC_CONSOLE_APP_URL` on the Next.js app to the deployed console URL

`console-app` build now emits a Netlify `_redirects` file automatically:

- `/api/*` -> `${VITE_REACT_APP_SERVER_URL}/api/*`
- `/mj/*` -> `${VITE_REACT_APP_SERVER_URL}/mj/*`
- `/pg/*` -> `${VITE_REACT_APP_SERVER_URL}/pg/*`
- SPA fallback -> `/index.html`

This keeps the console frontend same-origin with its own cookies while proxying API traffic back to the Next.js backend.

Example:

```bash
cd console-app
VITE_REACT_APP_SERVER_URL=https://vault.example.com npm run build
```

Then publish `console-app/dist`.

## Usage Logs

- `console-app` now reads common usage logs from `/api/log` and `/api/log/self`
- `/api/v1/[vendor]/[[...path]]` now writes both success and error entries into `vault:usage:logs`
- log entries include source page (for example `/vault`) and request path metadata so `/vault` calls can be identified inside Console

## Separation

- `vault/Next app`: user-facing frontend
- `console-app/`: internal admin console fork

Do not treat `console-app` as a page inside the Next.js app. It is a separate frontend application.
