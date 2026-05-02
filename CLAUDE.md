# CLAUDE.md

> Living orientation doc for fresh Claude sessions. Keep terse — long
> files cause context rot. README.md is human setup docs; don't duplicate.

---

## Project

Single-user personal finance tool. Plaid syncs transactions, investments,
and recurring streams into Supabase Postgres. Dashboard surfaces balances,
recurring outflows, and goal progress with EOM projections.

**Stack:** Next.js 14 (App Router) · TypeScript · Drizzle ORM · Supabase
Postgres · Auth.js v5 (magic-link via Resend) · Plaid · Tailwind +
shadcn/ui · Recharts. No test runner yet.

---

## Commands

- `npm run dev` — local dev at http://localhost:3000
- `npm run typecheck` / `lint` / `build`
- `npm run db:push` — push schema to Supabase (uses `DIRECT_DATABASE_URL`)
- `npm run db:studio` — Drizzle Studio

---

## Repo map

- [src/app/(app)/](src/app/(app)/) — protected pages; layout calls `auth()`
- [src/app/(auth)/](src/app/(auth)/) — login, verify, error
- [src/auth.ts](src/auth.ts) + [auth.config.ts](src/auth.config.ts) — see *Auth split*
- [src/middleware.ts](src/middleware.ts) — edge route guard (cookie-presence only)
- [src/lib/db/schema.ts](src/lib/db/schema.ts) — single Drizzle schema
- [src/lib/db/queries/](src/lib/db/queries/) — read helpers, one file per domain
- [src/lib/plaid/](src/lib/plaid/) — `sync.ts` orchestrator, `recurring.ts`, `actions.ts`, `client.ts`
- [src/lib/goals/actions.ts](src/lib/goals/actions.ts) — goal CRUD server actions
- [src/components/](src/components/) — feature folders + shadcn `ui/`

---

## Architecture notes

### Auth split — do not merge
Drizzle adapter pulls in `postgres-js` (Node TCP), which crashes the edge
runtime. Config is split:
- [auth.config.ts](src/auth.config.ts) — providers, callbacks, session
  strategy. Edge-safe. Imported by middleware.
- [auth.ts](src/auth.ts) — wraps config with `DrizzleAdapter`. Node only.
  Imported by app code.

Always import `{ auth, signIn, signOut }` from `@/auth`. See `b69bc31`.

### Database sessions ⇒ middleware can't validate
Strategy is `database`, so the session cookie is opaque and the only
validator is a DB lookup — impossible at the edge. Middleware checks
cookie *presence* only; the `(app)` layout calls `auth()` for the real
check. Reintroducing edge validation caused the redirect loop fixed in
`e9d51c8`.

### Plaid sign convention
`transaction.amount`: **positive = money OUT, negative = money IN**.
Stored as Plaid reports; flipped at display. Same for
`investment_transaction.amount`. Recurring streams use a `direction`
column (`'inflow' | 'outflow'`) instead.

### Sync orchestration
[sync.ts](src/lib/plaid/sync.ts) `syncItem(itemId)`: accounts first (FK
source), then transactions / investments / recurring via `Promise.all`.
Transactions cursor is only persisted after pagination completes — a
mid-loop crash doesn't skip pages. Investments sync is skipped if the
item has no investment-type accounts.

### Schema conventions
- Timestamps: `timestamp with time zone` via `ts()` helper. Calendar
  dates: `date(...)`.
- Money: `numeric(14, 2)`. Quantities: `numeric(18, 6)`. Prices:
  `numeric(14, 4)`.
- Plaid-sourced rows have a `plaid_*_id` unique column; upserts use
  `ON CONFLICT (plaid_*_id) DO UPDATE FROM excluded`.

### Server actions
Mutations live in `src/lib/<domain>/actions.ts`, called from
`<form action={...}>`. Zod-validate at the boundary, then
`revalidatePath()`. No tRPC, no API routes for app-internal mutations.

---

## Lessons learned

> Wrong moves we don't want to repeat. Format: `### Don't <thing>`
> (commit ref) · what happened · right approach. Prune stale entries.

### Don't run independent Plaid endpoints sequentially (`dcb4317`)
Original sync awaited accounts → transactions → investments → recurring
in series. Accounts must come first (FK source); the rest are
independent — `Promise.all` them.

### Don't insert Plaid rows one at a time (`7b548a8`)
First impl did one INSERT per transaction; a 90-day backfill produced
hundreds of round-trips. Batch into one
`INSERT … ON CONFLICT DO UPDATE FROM excluded` per section.

### Don't re-query rows you already loaded this run (`dcb4317`)
Sync helpers were each re-fetching `financial_accounts` for the same
item. `syncItem` now loads accounts once after the upsert and threads
the array into every helper.

### Don't create a new postgres-js client per HMR reload (`489bef2`)
Without `globalThis` caching, every dev-mode edit spawns a new pool and
exhausts Supabase's quota in minutes. See
[src/lib/db/index.ts](src/lib/db/index.ts).

### Don't try to feed `db:push` via stdin when `strict: true`
[drizzle.config.ts](drizzle.config.ts) has `strict: true`, which renders
an interactive arrow-key confirmation that `yes |` and `printf` can't
satisfy — the process just hangs. For a one-shot push: temporarily flip
to `strict: false`, push, flip back. Don't permanently disable strict.

### Don't run `npm run build` while `next dev` is running
Production build overwrites `.next/BUILD_ID` and the static chunk
manifests; the live dev server's module map points at chunk URLs that
no longer exist on disk, so the browser loads page HTML with no CSS
or JS — pages render unstyled until you Ctrl+C dev, `rm -rf .next`,
and restart `next dev`. Use `npm run typecheck` for verification while
dev is running; reserve `build` for pre-commit / pre-deploy moments.

### Don't trust Ctrl+C to kill the dev server's port binding
After editing `src/middleware.ts`, Next's edge module map can hold a
stale reference; symptom = `Error: Cannot find the middleware module`
on every request, browser shows "missing required error components,
refreshing..." in a loop. Standard fix is `Ctrl+C` + `rm -rf .next` +
`npm run dev`. *But* Ctrl+C sometimes leaves a zombie node process
holding port 3000 — the new dev server then binds 3001 and you keep
hitting the broken zombie at :3000. Always verify with
`lsof -nP -iTCP:3000 -sTCP:LISTEN` after a kill; `kill <pid>` the
zombie if present. Burned ~15min during the 2026-05-01 deploy session.

### Don't add `cache_control` to system blocks on SDK `^0.32.1`
SDK 0.32.1 predates `cache_control` on `TextBlockParam` — typecheck
fails. Either bump the SDK *or* drop the marker. On Haiku 4.5 a system
prompt under 4096 tokens won't cache anyway, so the marker is a no-op
at this scale; revisit when the prompt grows or the SDK is bumped. See
[src/lib/anthropic/insights.ts](src/lib/anthropic/insights.ts).

### Don't assume Plaid Production = real data flowing (2026-05-01)
Plaid deprecated the **Development** tier in 2024; only Sandbox and
Production exist now. *And* Production is institution-gated: having a
Production secret + `PLAID_ENV=production` is not enough — your app
must be approved for each major consumer institution (Amex consumer,
Fidelity, most big banks) before Link will let users connect them.
Symptom: "Connectivity not supported" inside Plaid Link, with the
search results filtered to only the institutions on your allowlist
(e.g. Amex search returns Kabbage but not consumer Amex). Approval
flow: dashboard.plaid.com/overview/production → app review, then
per-institution requests. Days-to-weeks, sometimes denied for
personal-use apps. Don't flip envs and wipe sandbox data until access
is confirmed — burned ~30min wiping the sandbox `plaid_items` and
discovering the gate post-flip.

---

## Coding conventions

- Comments encode WHY only (constraints, invariants). Names handle WHAT.
- Server components by default; `"use client"` only when interaction
  requires it.
- Imports: `@/...` always — no relative imports across `src/`.
- Currency: `formatCurrency()` in [utils.ts](src/lib/utils.ts), never
  `toFixed` by hand.

---

## Roadmap

### Done
- **Phases 1.A–1.C** — auth, Plaid Link, sync infra, dashboard +
  transactions + investments pages
- **Perf pass** — batched upserts + parallel Plaid endpoints
- **Phase 2** — recurring streams (pt1) · savings + spend-cap goals
  (pt2) · velocity + EOM projection + dashboard strip (pt3)
- **Phase 3-pt1** — `/insights` page, on-demand "Generate" button,
  unified weekly narrative covering spending / drift / goals /
  subscriptions, cached in `insight` table keyed by
  `(user_id, week_start)`
- **Phase 3-pt2** — `/drift` dashboard: 8-week multi-line trend chart
  (Recharts), currently-elevated category cards, flag history table.
  Pure SQL, no AI. Same threshold rules as pt1's prompt.
- **Security hardening + Plaid review prep** (2026-05-01) — AES-256-GCM
  encryption of `plaid_item.access_token` ([src/lib/crypto.ts]), single
  decryption boundary in `syncItem`. Dependabot weekly grouped npm PRs
  ([.github/dependabot.yml]). Public privacy policy at `/privacy`.
  [SECURITY.md] for threat model + practices.
- **Vercel deployment** (2026-05-01) — live at
  <https://foothold-beta.vercel.app>. Validated end-to-end: login flow,
  Resend magic-link delivery, Auth.js DB session, dashboard render. Repo
  is public on GitHub (<https://github.com/connordavis-code/Foothold>);
  reviewer-inspectable.

### In progress
- **Plaid Production access review** — submitted 2026-05-01 with the
  full security questionnaire. App name "Foothold", icon (slate-900 "F"
  monogram), brand color `#0F172A`, products = Transactions + Recurring
  + Investments, use case = "Personal budgeting and financial advice",
  pay-as-you-go billing. Q9 amendment email sent to
  building@plaid.com referencing the live `/privacy` URL. Honest
  approval-odds estimate at submission: ~25–35% first-pass, ~60–70%
  with follow-up clarification, ~25–35% denial with no path. May 6
  follow-up agent scheduled to triage status (see
  <https://claude.ai/code/routines>). DB is empty of Plaid data; the
  Wells Fargo sandbox item was wiped pre-review. Brief-use Production
  secret should be rotated on dashboard.plaid.com before reconnecting.

### Next up
- **Reconnect once approved** — flip `PLAID_ENV=production`, paste
  fresh Production secret, reconnect via `/settings`. Update Vercel env
  vars too. Watch for OAuth `redirect_uri` config — `linkTokenCreate`
  doesn't pass one; works on Vercel for non-OAuth institutions, breaks
  for Chase / Capital One / etc. without explicit redirect config.
- **Plaid webhooks** — currently sync only fires on initial connect or
  manual "Sync now". Adding `/api/plaid/webhook` for `TRANSACTIONS_*`
  and `ITEM_*` events enables auto-refresh and login-required UX.
  Buildable on sandbox; useful immediately on Production approval.
- **Phase 3-pt3** — per-goal coaching detail page (defer until real
  data is flowing; sandbox data has zero useful goals signal)
- **Phase 4** — predictive layer (forecasts, what-if simulator)
- **Phase 5** — Vercel cron (auto-generate insights weekly), custom
  domain + Resend domain (move off `onboarding@resend.dev`), monitoring

---

## Working notes for Claude

- End of session: update **Roadmap**. Add to **Architecture notes** only
  for a non-obvious *current* pattern. Add to **Lessons learned** only
  for a real wrong turn that cost time.
- This file is your only cross-session memory for repo facts. User
  collaboration preferences live in auto-memory, not here.
- Belongs-here test: would a fresh session derive this from the code in
  <60s? If yes, leave it out.
- **Three-strike rule:** same wrong move 3× across sessions → promote
  from Lesson to Architecture note (or a code-level guard).
