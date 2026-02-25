# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DM Checkout AI is a Shopify app (React Router v7 + Vite + Node.js 20) that automates Instagram DM/comment responses with AI-powered checkout links. It is a single-service app: one Node.js process serves both frontend (React/Polaris) and backend (API routes, webhooks).

### Key architectural notes

- **Prisma/SQLite** is used only for Shopify session storage (`prisma/schema.prisma`). All business data lives in Supabase (external PostgreSQL).
- The `npm run dev` command runs `shopify app dev` which requires Shopify CLI authentication and a Shopify Partner account with a registered app. For local development without Shopify CLI, run `npx vite --port 3000` directly.
- Environment variables are loaded by Vite in dev mode. The production server (`react-router-serve`) does NOT auto-load `.env` files — you must export them manually.

### Running the app

- **Dev server (Vite):** `npx vite --port 3000` — serves the app with HMR; server-side modules are lazy-loaded per request.
- **Production build + serve:** `npm run build && (set -a && source .env && set +a && npm run start)` — requires env vars exported.
- **Prisma setup:** `npm run setup` — generates Prisma client and runs SQLite migrations. Must be run after `npm install`.

### Required environment variables

A `.env` file at the project root must contain at minimum: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY_32B`. Generate an encryption key with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

### Lint, typecheck, build

- **Lint:** `npm run lint` — ESLint. The codebase has ~129 pre-existing lint errors (unused vars, unescaped entities, missing prop-types). These are not blocking.
- **Typecheck:** `npm run typecheck` — runs `react-router typegen && tsc --noEmit`. Passes cleanly.
- **Build:** `npm run build` — Vite production build. Succeeds with informational warnings about module externalization.

### Gotchas

- The `supabase.server.js` module throws at import time if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are missing. This means the production server crashes on startup without valid Supabase env vars, but the Vite dev server only errors when a route that imports Supabase is hit.
- The `crypto.server.js` module throws at import time if `ENCRYPTION_KEY_32B` is not exactly 32 bytes (after base64 or UTF-8 decode).
- Node.js 20 is required (`.nvmrc` specifies `20`, `engines` field requires `>=20.10`).
- Pages that don't require Supabase (e.g., `/terms`, `/privacy`, `/auth/login`) work without real Supabase credentials.
