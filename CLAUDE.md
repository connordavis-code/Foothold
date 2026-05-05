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
shadcn/ui · Recharts · Vitest.

---

## Commands

- `npm run dev` — local dev at http://localhost:3000
- `npm run typecheck` / `lint` / `build` / `test`
- `npm run test:watch` — Vitest watch mode
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

### App shell — where chrome lives
- [src/components/nav/top-bar.tsx](src/components/nav/top-bar.tsx)
  — sticky chrome with sync pill + ⌘K trigger + user dropdown
- [src/components/nav/app-sidebar.tsx](src/components/nav/app-sidebar.tsx)
  — Today / Plan / Records groups; active state via `<NavLink>`
- [src/components/nav/nav-routes.ts](src/components/nav/nav-routes.ts)
  — single source of truth for sidebar groups + top-bar title resolution
- [src/components/command-palette/](src/components/command-palette/)
  — global ⌘K palette with Navigate / Search / Actions sections;
  open state via `<CommandPaletteProvider>` (mounted by `(app)/layout.tsx`)
- Editorial tokens: `--surface-paper` / `-elevated` / `-sunken`,
  `--gradient-hero`, `radius-card` / `radius-pill`, motion + easing.
  See [globals.css](src/app/globals.css). `font-serif` reserved for
  /insights narrative only.

### Transaction category override is display-only
`transactions.categoryOverrideId` overrides the row's displayed
category (table + dashboard recent), but the filter dropdown still
uses raw Plaid PFC (`getDistinctCategories` reads
`transactions.primaryCategory`). Filtering by an override-applied
category doesn't surface those rows yet — follow-on if needed.

---

## Lessons learned

> Wrong moves we don't want to repeat. Format: `### Don't <thing>`
> · what happened · right approach. Prune stale entries.

### Don't feed `db:push` via stdin when `strict: true`
[drizzle.config.ts] strict:true renders an arrow-key prompt `yes |`
and `printf` can't satisfy — the process hangs. One-shot: flip
strict:false → push → flip back. Don't permanently disable.

### Don't run `npm run build` while `next dev` is running
Build overwrites `.next/BUILD_ID` and chunk manifests; live dev's
module map points at chunks no longer on disk → pages render unstyled
until Ctrl+C, `rm -rf .next`, restart dev. Use `typecheck` for
verification while dev runs; reserve `build` for pre-deploy.

### Don't trust Ctrl+C to fully kill `next dev` on :3000
After editing middleware, edge module map can hold a stale ref
("Cannot find the middleware module" loop). Standard fix: Ctrl+C +
`rm -rf .next` + restart. But Ctrl+C sometimes leaves a zombie holding
:3000; new dev binds :3001 and you keep hitting the broken zombie.
Verify with `lsof -nP -iTCP:3000 -sTCP:LISTEN`; kill zombie if present.

### Don't assume Plaid Production = real data flowing (2026-05-01)
Plaid deprecated **Development** in 2024 (only Sandbox + Production).
Production is institution-gated: secret + `PLAID_ENV=production` isn't
enough — app must be approved per major institution before Link allows
connections. Symptom: "Connectivity not supported" with filtered
search results. Approval takes days-to-weeks via
dashboard.plaid.com/overview/production. Don't wipe sandbox data
until institution access confirmed.

### Don't trust DNS/RDAP for domain availability (2026-05-01)
False positives — domains can be registered without NS records or
have stale RDAP. Registrar UI is the only ground truth.

### Don't deploy an env-gated feature without setting the env first (2026-05-04)
[src/lib/env.ts] validates required vars (zod `.min(...)`, no default)
at module load. Module load happens during `next build` because route
handlers import `env`, so a missing required var **fails the build
fast (~25s)** — Vercel keeps serving the previous deploy, the new
code never promotes, and Vercel doesn't email on failed deploys.
Symptom: pushed commit, no errors in inbox, but feature isn't live.
Always: set the env var in Vercel FIRST, push SECOND. Verify
promotion via Vercel deployments tab (Ready, not Error).

Side note from same incident: `.env.local` and Vercel both point at
the same Supabase prod DB (no separate dev DB). Locally-triggered
handlers write real rows to prod `error_log` — useful for testing,
but local runs are indistinguishable from prod-cron runs in inbox/DB
except for the from-address (`AUTH_EMAIL_FROM` in `.env.local` is the
Resend sandbox sender; in Vercel it's the custom domain).

### Don't add `/api/*` routes without exempting them in middleware (2026-05-03)
[src/middleware.ts] 401s any API path lacking a session cookie unless
its prefix matches `PUBLIC_API_PREFIXES`. `/api/auth`, `/api/plaid/webhook`
(JWS-signed), and `/api/cron/*` (bearer-auth) all self-authenticate
and must be in that list. Symptom: response body
`{"error":"Unauthorized"}` (JSON from middleware) instead of the
handler's own 401 — body shape reveals which layer fired.

### Don't pass forwardRef components across the server→client boundary (2026-05-05)
Lucide icons + most shadcn primitives are `forwardRef` components
(functions). Next 14 RSC refuses to serialize functions as props.
Symptom: `Error: Functions cannot be passed directly to Client
Components ... {$$typeof: ..., render: function <ComponentName>}`.
The named function in the error is always the offending component.
Two fixes: (a) pre-render the icon as a children prop (server
component renders `<Icon />`, the resulting element crosses cleanly),
or (b) store a string identifier and resolve to the component
inside the client component. Fixed in `d955dd4` for `<NavLink>`.

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
- **Phase 2** — recurring streams · savings + spend-cap goals · velocity
  + EOM projection + dashboard strip
- **Phase 3-pt1** — `/insights` page, on-demand Generate, weekly
  narrative cached in `insight` table keyed by `(user_id, week_start)`
- **Phase 3-pt2** — `/drift` dashboard: 8-week trend chart, currently-
  elevated category cards, flag history. Pure SQL, no AI.
- **Security hardening** (2026-05-01) — AES-256-GCM encryption of
  `plaid_item.access_token` ([src/lib/crypto.ts]); single decryption
  boundary in `syncItem`. Dependabot weekly grouped npm PRs.
  Public /privacy. [SECURITY.md] threat model.
- **Vercel deployment** (2026-05-01) — live at <https://usefoothold.com>;
  `foothold-beta.vercel.app` alias retained for legacy webhook
  continuity. Magic-link emails from `noreply@usefoothold.com` via
  Resend (custom domain verified). Repo public on GitHub.
- **Plaid webhooks** (2026-05-01) — `POST /api/plaid/webhook` with
  ES256 JWS verification ([src/lib/plaid/webhook.ts]). Reauth surfaces
  as banner + status pill + Reconnect button (Link update mode). Local
  testing requires a tunnel.
- **Phase 5 — Cron + monitoring** (deployed 2026-05-04) — four Vercel
  crons at `/api/cron/*` (insight Mon 04 UTC, sync 10 UTC, balances
  every 6h, digest 14 UTC). Bearer-auth via `CRON_SECRET`. `error_log`
  table is the digest's source of truth (level=error|info) — digest
  surfaces errors AND flags "NOT SEEN" for missing crons (silence ≠
  success). Logger fail-soft (never throws). 4×-daily balance refresh
  needs Vercel Pro. Ultrareview pass (commit `00093bd`) fixed 7
  findings post-merge: webhook DoS amplification, digest contract bugs
  (subject ignored warnings; insight had no missed-Monday branch),
  plus 5 nits.
- **Test infrastructure** (2026-05-04, commit `5adf667`) — Vitest 4
  with `@/` path resolution; 27 tests covering 4 of the 7 ultrareview
  findings as regressions plus baseline `formatCurrency`/`formatPercent`
  smoke tests. Pure predicates extracted from route handlers
  (`buildDigestSubject`, `isPublicApiPath`,
  `shouldLogWebhookVerificationFailure`) so tests don't need a DB or
  Next.js runtime. `npm test` runs in ~400ms.
- **Phase 4-A — Predictive engine + persistence + sidebar grouping**
  (2026-05-04) — pure `projectCash()` engine in `src/lib/forecast/`
  composing baseline (recurring + trailing 3-month median) with 5
  override appliers + goal projection in deterministic order. 67 new
  vitest tests (94 total). New `scenario` + `forecast_narrative`
  tables; scenario CRUD server actions with zod validation. Sidebar
  reorganized into Today / Plan / Records groups; brand "Finance" →
  "Foothold". `/simulator` page builds in Plan B.
- **Phase 4-B — Simulator UI + AI coaching** (2026-05-05) —
  `/simulator` page over Plan A's engine: 7-section override editor,
  Recharts baseline+scenario overlay, goal diff cards (sooner /
  later / hypo / unreachable), scenario CRUD via existing actions.
  `<NarrativePanel>` powered by Anthropic Haiku 4.5; cache-first via
  `forecast_narrative` keyed on `(scenarioId, sha256(overrides +
  history fingerprint))`. Stale-fallback on LLM failure. Panel
  suppressed on baseline / no-overrides / dirty unsaved. 133 vitest
  tests at end of Phase 4.

- **Phase 6 — UI redesign + polish** (2026-05-05) — full visual +
  IA rework against `docs/superpowers/specs/2026-05-05-foothold-redesign-design.md`.
  Sub-phases: 6.1 foundation (editorial tokens, sonner + cmdk +
  framer-motion, top-bar shell with sync pill + ⌘K trigger,
  sidebar restyle); 6.2 dashboard card-newsfeed (hero gradient
  + sparkline, split card, drift/goals row/upcoming/insight/recent
  cards); 6.3 transactions operator-tier (mono table, j/k/⌘↑/⌘↓//
  keyboard nav, ⌘K palette with transaction search); 6.4
  investments operator-tier (flat-default holdings, group-by toggle,
  3-cell summary). Plus: streaming loading.tsx skeletons, framer-
  motion stagger on /dashboard, editorial empty states, multi-select
  + bulk re-categorize on /transactions (`categoryOverrideId` FK +
  cmdk picker), visual refresh of /drift /goals /insights /recurring
  (IA preserved; per-page IA rework deferred). 134 vitest tests.

### In progress
- **Plaid Production access review** — submitted 2026-05-01 + Q9
  amendment. Approval odds ~25-35% first-pass, ~60-70% with follow-up.
  May 6 triage agent scheduled. One sandbox Wells Fargo item kept for
  webhook E2E — wipe before flipping `PLAID_ENV=production`.

### Next up
- **Reconnect once Plaid approved** — flip `PLAID_ENV=production`,
  paste fresh secret, update Vercel env, reconnect via `/settings`.
  `linkTokenCreate` doesn't pass `redirect_uri` — fine for non-OAuth
  banks, breaks Chase / Cap One until configured.
- **Per-page IA reworks** for /drift, /insights, /goals, /recurring
  — Phase 6 shipped a visual refresh; the underlying IA on these
  surfaces is still legacy. Each is roughly phase-sized. /insights
  is the highest-leverage candidate (narrative is the value prop;
  current page is a single Card).
- **Dark-mode visual sweep** — tokens defined in 6.1 and parity-
  mapped in `:root` / `.dark`, but the dark variant has never been
  walked through against the new editorial chrome.
- **Mobile-first responsive audit** — current design works at small
  widths via reflow, but no surface has been deliberately designed
  for mobile. Sidebar collapse → Sheet drawer (vaul) is the obvious
  starter.
- **Phase 3-pt3** — per-goal coaching detail page (defer until real
  data flows)
- **Phase 4-pt2** — investment what-if simulator (deferred from Phase
  4 by design; needs its own brainstorm focused on modeling depth).

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
