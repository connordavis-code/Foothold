# Security

## Scope

Foothold is a single-user, self-hosted personal finance dashboard. Threat
model: one operator (also the sole consumer of data); no third-party
users, no shared infrastructure. Sensitive data: bank/card transactions,
investment holdings, and the Plaid `access_token` per connected
institution.

## Secrets

All secrets live in environment variables (`.env.local` for local dev,
Vercel project settings for deployed). `.env.local` is gitignored and
never committed. Required secrets: `AUTH_SECRET`, `AUTH_RESEND_KEY`,
`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_TOKEN_ENCRYPTION_KEY`,
`ANTHROPIC_API_KEY`, `DATABASE_URL`, `DIRECT_DATABASE_URL`.

Rotating `PLAID_TOKEN_ENCRYPTION_KEY` invalidates every stored access
token — every `plaid_item` must be reconnected. There is no key
versioning.

## Encryption

- **In transit**: TLS 1.3 end-to-end (Vercel ↔ browser, Vercel ↔
  Supabase, Vercel ↔ Plaid, Vercel ↔ Resend, Vercel ↔ Anthropic).
- **At rest, database layer**: Supabase Postgres encrypts the entire
  database with AES-256.
- **At rest, application layer**: `plaid_item.access_token` is
  additionally encrypted with AES-256-GCM before write
  (`src/lib/crypto.ts`). Single decryption boundary: `syncItem` in
  `src/lib/plaid/sync.ts`.

## Database access boundary

Supabase auto-exposes every `public.*` table via PostgREST under the
project's anon key. Foothold does not use PostgREST — Drizzle connects
through `DATABASE_URL` / `DIRECT_DATABASE_URL` as the `postgres` role
(`BYPASSRLS`). Without RLS, a leaked anon key would still grant full
read/write access via the REST API. Policy: **every `public.*` table
runs with RLS enabled and no policies attached** — default-deny for
`anon` and `authenticated` roles, no effect on the app's elevated
connection. Applied 2026-05-06 in response to Supabase advisor flag
`rls_disabled_in_public`. `db:push` does not emit
`ENABLE ROW LEVEL SECURITY`, so any new table added to
[src/lib/db/schema.ts](src/lib/db/schema.ts) requires
`ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;` to be run
manually against the database before promoting the schema change.

## Authentication

Magic-link via Resend, scoped to a single allowlisted email. Sessions
are stored in Postgres (Auth.js `database` strategy); the cookie is
opaque, validated server-side on every protected request.

## Dependencies

Dependabot scans `package.json` weekly and opens grouped minor/patch
PRs (`.github/dependabot.yml`). Major-version bumps are reviewed
individually.

## Reporting

Found a vulnerability? Email davis.connor208@gmail.com. There is no
bounty program.
