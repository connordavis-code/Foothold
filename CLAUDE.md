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

### RLS on every `public.*` table — `db:push` won't add it
Supabase auto-exposes `public.*` via PostgREST under the anon key.
Drizzle bypasses PostgREST (connects as `postgres` w/ `BYPASSRLS`),
but a leaked anon key would hit the REST API directly. Mitigation:
RLS enabled on every table, no policies attached → default-deny for
`anon`/`authenticated`, no effect on the app. `drizzle-kit push`
does NOT emit `ENABLE ROW LEVEL SECURITY` for new tables, so when you
add one to [schema.ts](src/lib/db/schema.ts), run
`ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;` against the DB
before considering it shipped. Threat-model rationale in
[SECURITY.md](SECURITY.md) > "Database access boundary".

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

### Forecast engine consumes raw PFC totals
`computeBaseline` projects outflows as `sum(median(PFC trailing 3mo))`,
not `recurring + non-recurring residual`. Plaid already classifies
recurring transactions under their PFC, so summing PFC categories
gives the full monthly outflow without double-counting. The
recurring/non-recurring split is recovered when needed (override
appliers — pause/edit/skip — and the AI prompt) by computing from
`history.recurringStreams` directly. Closes review C-01: dropping
the query-layer subtraction in `getForecastHistory` removed a
lifecycle off-by-one and a `Math.max(0, …)` information-loss path
that under-projected category spend. Spec at
`docs/superpowers/specs/2026-05-05-c01-forecast-recurring-subtraction-design.md`.

### Forecast override appliers use signed math; clampForDisplay is the only clip
Each applier in [apply-overrides.ts](src/lib/forecast/apply-overrides.ts)
accumulates SIGNED deltas; `inflows` / `outflows` / `byCategory[id]` may
be negative through the chain. `projectCash` runs `clampForDisplay` once
at the end which clips those three for rendering — `startCash` /
`endCash` are preserved unclamped so the cash chain stays consistent
with the math (a user seeing `inflows: 0` AND `endCash: -3000` is the
display surfacing an over-cut signal). Order of override application
no longer matters mathematically — see
`apply-overrides-commutativity.test.ts`. Closes review W-09. Spec at
`docs/superpowers/specs/2026-05-05-w09-override-applier-clipping-design.md`.

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

> Detail-canonical: git log carries SHAs and commit messages; specs in
> `docs/superpowers/specs/` carry shape briefs; REVIEW.md / UAT.md
> carry per-finding cross-refs. Entries below preserve only what's
> non-obvious from those + the codebase.

**Foundation + sync** (2024 → 2026-04)
- **Phases 1.A–1.C** — auth, Plaid Link, sync infra, dashboard /
  transactions / investments pages. Batched upserts + parallel Plaid
  endpoints (perf pass).
- **Phase 2** — recurring streams · savings + spend-cap goals ·
  velocity + EOM projection + dashboard strip.
- **Phase 3-pt1** — `/insights` page, on-demand Generate, weekly
  narrative cached in `insight` table keyed by `(user_id,
  week_start)`.
- **Phase 3-pt2** — `/drift` dashboard: 8-week trend chart, currently-
  elevated category cards, flag history. Pure SQL, no AI.

**Security + deployment** (2026-05-01)
- AES-256-GCM encryption of `plaid_item.access_token`
  ([src/lib/crypto.ts]); single decryption boundary in `syncItem`.
  [SECURITY.md] threat model. Dependabot weekly grouped npm PRs.
- Live at <https://usefoothold.com>; `foothold-beta.vercel.app` alias
  retained for legacy webhook continuity. Magic-link from
  `noreply@usefoothold.com` via Resend.
- Plaid webhooks at `POST /api/plaid/webhook` (ES256 JWS verification).
  Reauth surfaces as banner + sync pill + Reconnect button (Link
  update mode).

**Phase 4 — Forecast engine + simulator** (2026-05-04 → 05)
- `projectCash()` in `src/lib/forecast/` composes baseline
  (recurring + trailing 3-month median) with 5 override appliers +
  goal projection in deterministic order. New `scenario` +
  `forecast_narrative` tables. See Architecture > "Forecast engine
  consumes raw PFC totals" + "override appliers use signed math" for
  load-bearing invariants.
- `/simulator` page: 7-section override editor, Recharts overlay,
  goal diff cards. `<NarrativePanel>` via Anthropic Haiku 4.5;
  cache-first against `forecast_narrative` keyed on
  `(scenarioId, sha256(overrides + history fingerprint))`,
  stale-fallback on LLM failure.

**Phase 5 — Cron + monitoring** (2026-05-04)
- Four Vercel crons at `/api/cron/*`: insight Mon 04 UTC, sync 10 UTC,
  balances every 6h, digest 14 UTC. Bearer-auth via `CRON_SECRET`.
  4×-daily balance refresh requires Vercel Pro.
- `error_log` table is the digest's source of truth — surfaces errors
  AND flags "NOT SEEN" for missing crons (silence ≠ success). Logger
  fail-soft (never throws). Test infra: Vitest 4 with `@/` resolution;
  pure predicates extracted from route handlers so tests don't need
  DB or Next runtime.

**Phase 6 — UI redesign** (2026-05-05; spec at
`docs/superpowers/specs/2026-05-05-foothold-redesign-design.md`)
- Sub-phases: 6.1 foundation (editorial tokens, sonner+cmdk+framer-
  motion, top-bar shell with sync pill + ⌘K, sidebar restyle); 6.2
  dashboard card-newsfeed; 6.3 /transactions operator-tier (mono
  table, j/k/⌘↑/⌘↓// nav, ⌘K palette); 6.4 /investments operator-
  tier; 6.5 /insights IA rework (latest-read + receipts grid +
  `?week=YYYY-MM-DD` deep links); 6.6 quality pass (PRODUCT.md added,
  `.text-eyebrow` utility sweep, amber standardization, brand-tinted
  `--chart-1..6`, alert-dialog gating on `/goals` + `/simulator`
  delete, /simulator tokenize-bridge); 6.7 cheatsheet dialog +
  tri-state select-all + sonner-with-undo on bulk re-categorize;
  6.7-followon (/investments group-by-value sort, `humanizeCategory`
  consolidation in `src/lib/format/category.ts`).
- **`/drift` IA rework** — `<ElevatedTile>` drills to
  `/transactions?category=<pfc>&from=<weekStart>&to=<weekEnd>`;
  trend chart replaced by horizontal bar leaderboard with baseline
  tick (`buildLeaderboard()` + `<Leaderboard>` component, single
  foreground hue + amber for elevated rows).
- **DESIGN.md** — Stitch format. Tokens + named rules (160/40 hue,
  single-hue elevated, restrained accent floor, mono-numeral,
  borders-not-shadows, editorial card default). Pair with
  [PRODUCT.md](PRODUCT.md). North Star: "The Operator's Field
  Notebook."

**Code review + fixes** (2026-05-05; review at
`docs/reviews/2026-05-05-REVIEW.md`, UAT at `2026-05-05-UAT-checklist.md`)
- 19 of 22 findings closed (4 critical / 11 warning / 7 info). Three
  deferred-acknowledged: W-05/W-06 (multi-Plaid-item state, blocks on
  Plaid Production approval), W-07 (digest 24h window edge), W-08
  (narrative cache canonical JSON). Architecture notes above capture
  the load-bearing outcomes (C-01 forecast PFC, W-09 signed override
  math). +43 vitest regressions (175 → 218).

**`/goals` IA rework** (2026-05-05; spec at
`docs/superpowers/specs/2026-05-05-goals-ia-rework-design.md`)
- 2-col tile grid → sectioned pace leaderboard (Behind pace above
  On pace, severity-sorted). `<GoalRow>` with stretched-`<Link>`
  drilldown on spend-cap rows only — asymmetric is intentional: caps
  map to a clean `category+from=monthStart` /transactions filter;
  savings account-scope drill would surface paychecks and transfers
  as noise. Pure predicates in `src/lib/goals/pace.ts`: `paceVerdict`
  (over / behind / on-pace / hit) + `severityKey` (bucketed
  100/50/25/20). Page collapsed -188/+5 lines.

**`/recurring` IA rework** (2026-05-06; spec at
`docs/superpowers/specs/2026-05-05-recurring-ia-rework-design.md`)
- Single sticky-header table → layered four-section overview:
  conditional Hike alerts (lastAmount > 1.15 × averageAmount AND
  ≥ $2/mo monthly-equivalent floor), then Plaid-PFC-clustered
  category sections sorted by total `$/mo` desc with "Other" pinned
  bottom, then Inflows section, then Recently cancelled (TOMBSTONED
  + last hit within 90 days). Stretched-`<Link>` drilldown on both
  outflow and inflow rows when merchantName is non-empty, via
  `/transactions?q=<merchant>&from=<6mo>` (`q=` ILIKEs both
  `transactions.name` AND `merchantName` per
  `src/lib/db/queries/transactions.ts`). Monthly remains the
  headline unit per user direction — operator cashflow lives in
  months; the rework's value is reorganization, not unit reframe.
  Pure predicates in `src/lib/recurring/analysis.ts`: `hikeRatio`,
  `isHikeAlert` (15% + $2/mo floor), `monthlyCost`, `groupByCategory`.
  Page collapsed -217/+15 lines.

**Dark mode wiring** (2026-05-06)
- `<ThemeProvider>` mounted in `src/app/layout.tsx` (next-themes,
  `attribute="class" defaultTheme="system" enableSystem`,
  `disableTransitionOnChange`). `<ThemeToggle>` dropdown
  (Light / Dark / System) at
  `src/components/nav/theme-toggle.tsx`, mounted in the top-bar
  right cluster between sync pill and user avatar.
- Visual sweep deferred to runtime UAT but **codebase audit found
  zero hardcoded color utilities** (no `bg-white`, `text-black`,
  `bg-gray-*`, hex literals, or inline color styles in `src/`).
  Every surface routes through the editorial tokens, both `:root`
  and `.dark` blocks of `globals.css` are fully parity-mapped, and
  `bg-gradient-hero` is intentionally dark in both modes (so the
  hero card / empty-state icons / loading skeleton all use
  `text-white` correctly under both themes). Recharts colors
  reference `hsl(var(--*))` tokens and auto-flip.
- Email digest in `src/app/api/cron/digest/route.ts` keeps its
  hex literals (server-rendered HTML for Resend, not affected by
  `.dark`).

Test count: 266 vitest (unchanged — dark mode adds no testable
predicates).

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
- **Mobile-first responsive audit** — *primary surface for this
  user is mobile.* Current design works at small widths via reflow,
  but no surface has been deliberately designed for mobile. Sidebar
  is `hidden md:flex` (vanishes <768px) — collapse → Sheet drawer
  (vaul) is the obvious starter. Top-bar already mobile-friendly
  (`px-4` → `md:px-6`, no collapse). Audit pass should cover: tap
  target sizing across operator-tier tables (/transactions,
  /investments), thumb-reach for top-bar controls, bottom-nav vs
  sidebar pattern decision, and `<640px` UAT of every page.
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
