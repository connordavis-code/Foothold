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

### Multi-aggregator: external_item + dispatcher
Plaid is no longer the only aggregator. `external_item` (was
`plaid_item`) carries a `provider` discriminator — currently
`'plaid' | 'snaptrade'`. Per-provider mutable state lives in
`provider_state` JSONB so adding new providers doesn't churn the
column set (Plaid stores its `transactionsCursor` here).

`secret` on `external_item` is **nullable**. Plaid rows always set it
(per-item access_token); SnapTrade rows leave it NULL because their
`userSecret` is per-USER, not per-connection — that lives on
[snaptrade_user](src/lib/db/schema.ts) (1:1 with users.id). When
working in Plaid code paths, narrow with the `PlaidExternalItem`
type from [plaid/sync.ts](src/lib/plaid/sync.ts) which asserts
`secret: string`. Plaid-specific selects in
[plaid/actions.ts](src/lib/plaid/actions.ts) defensively filter
`provider='plaid'`.

Sync entry point: [`syncExternalItem(id)`](src/lib/sync/dispatcher.ts)
reads `provider` and routes to `syncPlaidItem` or `syncSnaptradeItem`,
returning a discriminated-union summary. Cron + /settings sync button
use it. The Plaid update-mode reconnect flow stays Plaid-specific
(`markItemReconnected` calls `syncPlaidItem` directly).

Disconnect: [`disconnectExternalItemAction`](src/lib/sync/actions.ts) —
'use server' module dispatching by provider. Lives separate from
`dispatcher.ts` because that file exports non-action plain functions,
which Next 14 RSC rejects in `'use server'` modules.

SnapTrade reuses `plaid_account_id` / `plaid_security_id` /
`plaid_investment_transaction_id` as provider-stable IDs (UUIDs vs
Plaid namespace IDs don't collide). Future cleanup may rename to
provider-neutral; not load-bearing.

SnapTrade activity amounts are **flipped** at the sync boundary
([snaptrade/sync.ts](src/lib/snaptrade/sync.ts)) so the codebase's
"positive = cash OUT" invariant holds across providers.

UI gating: `snaptradeConfigured()` from
[snaptrade/client.ts](src/lib/snaptrade/client.ts) is server-evaluated
and passed as `snaptradeEnabled` into
[ConnectAccountButton](src/components/connect/connect-account-button.tsx).
Keys unset → SnapTrade card hidden; Plaid path unchanged.

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

### Don't pass functions across the server→client boundary in config props (2026-05-07)
Same general failure mode as the forwardRef lesson — functions in any
shape (component, callback, getter) can't cross RSC. /drift's mobile
flag-history list passed a `<MobileList>` config object full of
functions (`rowKey`, `topLine`, `rightCell`, `rowHref`) directly from
the server page. Latent for weeks because the render path was gated on
`flagHistory.length > 0`; AmEx's production backfill flipped a category
into elevated state for the first time and the bug fired.

Symptom: `Application error: a server-side exception has occurred (see
the server logs for more information). Digest: <number>`. Next 14
renders the error.tsx fallback for any uncaught page-render exception;
the actual "Functions cannot be passed directly to Client Components"
message only surfaces in Vercel logs.

Fix: tiny client-component wrapper that holds the config in client-side
scope. /transactions does this via `<MobileTransactionsShell>` — same
pattern. Fixed in `deb1d43` via `<FlagHistoryList>`.

This is **strike two for non-serializable values across RSC** (count
the forwardRef lesson). One more and it gets promoted from Lesson to
Architecture note (or a code-level guard, e.g., a lint rule).

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
- **Codebase audit found zero hardcoded color utilities** (no
  `bg-white`, `text-black`, `bg-gray-*`, hex literals, or inline
  color styles in `src/`). Every surface routes through editorial
  tokens; both `:root` and `.dark` blocks of `globals.css` are
  fully parity-mapped; `bg-gradient-hero` is intentionally dark in
  both modes (so the hero card / empty-state icons / loading
  skeleton all use `text-white` correctly under both themes).
  Recharts colors reference `hsl(var(--*))` tokens and auto-flip.
- Runtime UAT across all 9 surfaces confirmed 2026-05-06.
- Email digest in `src/app/api/cron/digest/route.ts` keeps its
  hex literals (server-rendered HTML for Resend, not affected by
  `.dark`).

**Mobile-first design** (2026-05-06; spec at
`docs/superpowers/specs/2026-05-06-mobile-first-responsive-design.md`)
- **Phase 1** — vaul installed; tap-target uplift (Button/Input
  h-10 → h-11, 44px floor); 5-tab `<MobileTabBar>` (Home / Recurring
  / Invest / Activity / More). The "More" slot opens a vaul Drawer
  from the bottom carrying long-tail nav (Insights / Drift / Goals
  / Simulator / Settings) — single canonical path replaces a
  short-lived top-bar hamburger. Long-tail is COMPUTED from
  `nav-routes.ts` via set-difference against the 4 primary tab
  hrefs, so adding a route to nav-routes propagates to More
  automatically. `viewport={ viewportFit: 'cover' }` in root layout
  so `safe-area-inset-*` env vars resolve on iPhone.
- **Phase 2** — Generic `<MobileList>` at `src/components/operator/`
  with field-config object; `dateField` optional (holdings render
  flat, txns / drift / investment-txns render date-grouped via
  new `humanizeDate` helper at `src/lib/format/date.ts`). CSS-only
  swap (`hidden md:block` / `block md:hidden`) — both renders ship,
  no JS-runtime branching, no hydration risk. `<MobileFilterSheet>`
  + `<TransactionDetailSheet>` are vaul bottom drawers; detail-
  sheet accepts a narrow `DetailRow` shape so /transactions AND the
  dashboard `<RecentActivityCard>` drive the same picker.
  /transactions mobile uses IntersectionObserver-driven infinite-
  scroll via `loadMoreTransactionsAction` — SSR owns page 1, client
  owns the tail, appended rows reset on `initialRows` identity
  change so filter changes / `router.refresh()` stay race-free.
- **Dashboard polish (follow-on)** — recent-activity rows tap-to-
  edit at <md (presentational at md+ to avoid conflict with j/k +
  bulk-action gestures); `getRecentTransactions` left-joins
  categories so override-aware labels finally render here too.
  Upcoming-recurring rows wrap in conditional `<Link>` matching the
  /recurring drill contract (`q=<merchant>&from=<6mo>`); fall
  through to non-interactive `<li>` when no useful term — keeps
  the affordance honest (no hover state on dead rows).
- **Phase 3 — `/simulator` portrait pass**: `<OverrideSection>`
  lifted to fully-controlled (`open` + `onToggle` props); parent
  dispatches single-open accordion on <md (auto-collapse siblings)
  and independent multi-open on md+ (preserves desktop "compare
  two at once"). Breakpoint detection lives inside the click
  handler via `window.matchMedia('(max-width: 767px)')` — read at
  click time so SSR markup is breakpoint-agnostic.
  `<ForecastChart>` swaps to `aspect-square` + below-chart legend
  + Recharts `trigger="click"` tooltip on <md. New
  `<MobileScenarioSaveBar>` pinned `bottom-14` (above the 56px
  tab bar), always visible — Save disabled when `!isDirty` so the
  CTA's location is stable. "Save as…" opens a vaul drawer with a
  name input rather than the desktop's inline transform. Page
  padding `pb-24 md:pb-8` so the override editor tail clears the
  sticky bar.

Test count: 280 vitest (266 → +14 from `humanizeDate`,
`groupByDate`, `activeTransactionFilterCount`; Phase 3 is UI
plumbing with no testable predicates).

**Plaid Production cutover** (2026-05-06–07)
- `PLAID_ENV=production` flipped; Wells Fargo connected via real OAuth
  end-to-end. Two banks initially failed at Link with different
  wordings — diagnostic split:
  - **AmEx** ("Plaid doesn't support connections between AmEx and
    Foothold"): per-app-product-config mismatch. Default `PLAID_PRODUCTS`
    requested `transactions+investments`; AmEx is credit-card-only with
    no investments product, so the AND-filter on `linkTokenCreate`
    excluded it. Fix in `fb0e421`: split to `products: ['transactions']`
    + `additional_consented_products: ['investments']` so investments is
    initialized per-institution where supported, silently skipped
    elsewhere. AmEx connects cleanly post-fix.
  - **Fidelity** ("Fidelity accounts are not able to be connected
    through Plaid at this time"): Plaid platform-side block, not in
    Plaid Dashboard's OAuth-institutions list at all. Public industry
    context: Plaid–Fidelity dispute over data-access fees, with Fidelity
    routing partners through their own Akoya/Fidelity-Access channel.
    No code-level fix; tracked under SnapTrade integration as the
    realistic path.

**Multi-aggregator scaffolding** (2026-05-07)
- **Phase A** (`cebde2d`): generalize `plaid_item` → `external_item`
  with `provider` discriminator + `provider_state` JSONB. Plaid
  cursor migrated into providerState. Migration SQL in
  `docs/migrations/2026-05-06-external-item.sql`, applied in-place to
  the live Wells Fargo row. 27 files mechanically renamed; logger
  context key `plaidItemId` → `externalItemId`.
- **Phase B** (`7bb611b`): SnapTrade integration data layer. New
  `snaptrade_user` table (1:1 with users.id) holds per-user encrypted
  `userSecret`; `external_item.secret` relaxed to NULLABLE so SnapTrade
  rows can leave it NULL. `snaptrade-typescript-sdk` installed; client
  wrapper + server actions (register / portal-URL / reconcile /
  disconnect); sync orchestrator mapping accounts → positions →
  activities onto the existing `holding` + `investment_transaction`
  tables. New dispatcher `syncExternalItem` in `src/lib/sync/`
  routes by provider. Cron + sync-button updated to use it. Sign
  convention flipped on SnapTrade activities to match Plaid's
  positive=cash-OUT invariant.
- **Phase C** (`d96d6e9`): UI surface. `<ConnectAccountButton>` provider
  picker on /settings (Bank/credit via Plaid, Brokerage via SnapTrade);
  /snaptrade-redirect parent/child page mirroring /oauth-redirect's
  pattern; unified `disconnectExternalItemAction` dispatching by
  provider. SnapTrade option gated server-side via `snaptradeConfigured()`
  — keys unset hides the brokerage card.

**Drift RSC boundary fix** (2026-05-07; `deb1d43`)
- Latent server→client boundary bug in /drift exposed when AmEx's
  backfill flipped a category into elevated state for the first time
  (flagHistory.length > 0 → MobileList rendered with config-of-functions).
  Fixed via `<FlagHistoryList>` client wrapper. See Lessons learned >
  "Don't pass functions across the server→client boundary in config props."

**Observability + W-06 sparkline + SnapTrade inline sync** (2026-05-07 evening)
- **Logger axios capture** (`05c12de`) — `logError` duck-types
  axios-shaped errors and persists `httpStatus` + `responseBody` to
  the context column. Plaid + SnapTrade SDK 4xx rows in `error_log`
  now carry their structured upstream payload (Plaid:
  `error_code`/`error_type`/`request_id`; SnapTrade: similar) instead
  of the opaque "Request failed with status code 400" that used to
  be all that survived. Forced by the `cron.balance_refresh` 400s
  being un-debuggable from logs alone.
- **W-06 sparkline scope + empty state** (`2e86e8d` + `1af7b07`,
  finding W-06 in `docs/reviews/2026-05-05-REVIEW.md`) —
  `getNetWorthSparkline` previously anchored on `summary.netWorth`
  (which already includes accounts opened mid-window) and walked
  back through transactions. New accounts have no compensating
  opening-balance txn, so their `currentBalance` carried into "30
  days ago" with nothing to subtract — visible as a fake $50k jump
  on first-render after any new account connect within the window.
  Fix: anchor on signed sum of stable, non-investment accounts
  (`createdAt <= startStr`) and apply the same `lte(createdAt,
  startDate)` filter to the transaction JOIN. When zero stable
  accounts exist (brand-new install), the query returns `[]` and
  `<HeroCard>` swaps the sparkline for "Trend appears once your
  accounts have 30 days of history". Today's sparkline value can
  diverge from `getDashboardSummary().netWorth` when accounts are
  <window-old; sparkline is rendered shape-only so the divergence
  isn't user-visible.
- **SnapTrade inline sync** (`d0b7de4`) —
  `syncSnaptradeBrokeragesAction` returns the inserted
  `external_item.id`s; `<SnaptradeRedirectClient>` runs
  `syncItemAction(id)` per new item via `Promise.allSettled`. Brand-
  new brokerage connections render holdings on `/investments`
  immediately instead of waiting up to 24h for the nightly cron.
  `allSettled` preserves partial success when one of multiple new
  brokerages fails its initial sync — toast surfaces the failure
  count, success state otherwise renders a primary "View
  investments" CTA.

### In progress
- **Reliability initiative** — make Foothold trustworthy enough to
  replace checking multiple finance apps. Six-phase plan + canonical
  handoff in `docs/reliability/implementation-plan.md` and
  `docs/reliability/README.md`. Principle: important financial
  numbers should carry freshness/health context (fresh, stale,
  partial, failed, unverifiable).
- **Phase 1 (balance refresh + W-05) — implemented; production
  verification pending the next 00:00 UTC cron.** Three changes in
  `src/app/api/cron/balances/route.ts` + new pure helpers in
  `src/lib/plaid/balance-refresh.{ts,test.ts}` (13 tests):
  (a) capability filter — pre-fetch per-item `financial_account` rows,
  retain only `depository`+`credit`, pass explicit `account_ids` to
  `accountsBalanceGet`. Items with zero capable accounts → `continue`
  + info log `cron.balance_refresh.skipped`, not a 4xx.
  (b) W-05 — UPDATE WHERE now scoped on `(itemId, providerAccountId)`
  to survive disconnect+reconnect re-use scenarios.
  (c) null-clobber guard — `buildBalanceUpdate` only includes a balance
  field when Plaid returned a non-null value, preserving prior
  `currentBalance`/`availableBalance` rather than writing null over
  real data (read surfaces in `dashboard.ts`, `forecast.ts`,
  `goals.ts` treat null as zero, so silent null-writes were worse
  than a 4xx).
  Per-item success now writes `cron.balance_refresh.item` info row
  carrying `accountCount` + `updatedCount` — Phase 3's health query
  reads this `op` to derive last-successful-balance-refresh per item.
  Aggregate response + summary log gain a `skipped` counter.
  **Verification protocol** (after deploy): `node
  scripts/diagnose-balance-refresh.mjs` after 00:00 UTC and confirm
  (a) `cron.balance_refresh.item` info rows exist for both WF + AmEx,
  (b) zero new HTTP 400 rows, (c) WF depository + AmEx credit balances
  updated; nothing else touched. **If AmEx still 400s**, root cause is
  institution/product-capability-specific (not the bare-call shape) —
  read `error_log.context.responseBody` for the structured Plaid
  `error_code` and iterate. Phase 1 then ships only the depository
  path.
- **Phase 2 (sync health classification, pure) — shipped.**
  `src/lib/sync/health.{ts,test.ts}` (39 tests). Discriminated-union
  `CapabilityState` (`not_applicable` vs `tracked` with success/failure
  timestamps + optional summary); 4 capabilities (`balances`,
  `transactions`, `investments`, `recurring`); per-provider
  `FRESHNESS_POLICY` (Plaid balances 12h, nightly windows 36h;
  SnapTrade omits balances + recurring). `classifyItemHealth` returns
  `state` + `requiresUserAction` + `reason` + `byCapability`
  breakdown. Priority: `needs_reconnect` (any non-active itemStatus)
  → `unknown` (no applicable caps OR all never_synced) → `degraded`
  (some failed + some success-backed `fresh`/`stale`) → `failed`
  (some failed + no success-backed; never_synced doesn't count as
  working) → `healthy` (all fresh) → `stale`. `syncing` is set by callers
  (in-flight sync UI), never derived. Design deltas vs the original
  spec block documented in `docs/reliability/implementation-plan.md`
  § Phase 2 Status (notably: dropped `accounts` capability; defensive
  tracked-but-no-policy → N/A; required-Record input forces explicit
  N/A handling).
- **Phase 3 (sync health DB query) — shipped.**
  `src/lib/db/queries/health.{ts,test.ts}` (23 pure tests on three
  mapping helpers). `getSourceHealth(userId)` returns one
  `SourceHealth` row per `external_item` carrying the Phase 2 verdict
  (state/reason/requiresUserAction/byCapability) plus raw timestamps
  for "as of when" UI copy. Capability inference is provider-aware
  and account-types-driven for Plaid (`balances`/`transactions`/`recurring`
  gate on depository+credit; `investments` gates on investment),
  fixed-shape for SnapTrade (`transactions + investments` always).
  Log → CapabilityState mapping handled by pure helper
  `resolveCapabilityTimestamps(provider, lastSyncedAt, ops)` which owns
  the op-class → capability translation rules. Four load-bearing
  resolutions: (1) `external_item.lastSyncedAt` fallback for nightly-
  backed capabilities (manual / initial sync writes lastSyncedAt but
  no info row, so freshly connected sources count as fresh);
  (2) SnapTrade per-capability error ops merge into the relevant
  capability's failure timestamp — `snaptrade.sync.activities` →
  transactions, `snaptrade.sync.positions` → investments;
  (3) **SnapTrade per-capability success info rows are
  AUTHORITATIVE** — `syncSnaptradeItem` writes
  `snaptrade.sync.{activities,positions}` info rows ONLY when EVERY
  account succeeded for that capability; when present they override
  the orchestrator's lastSyncedAt rollup, so partial failures no
  longer mask as `fresh`; (4) `sync.dispatcher` errors apply to all
  nightly-backed capabilities for both providers (manual sync
  failures previously vanished from health). Composite index added
  to schema — **`npm run db:push` required** to apply
  `error_log_item_op_occurred_idx (external_item_id, op, occurred_at)`.
  Query shape is 1 + 9N (1 typed Drizzle for items+account-types
  array_agg, 9 parallel error_log lookups per item: balance
  success/failure, nightly success/failure, snaptrade activities
  success/failure, snaptrade positions success/failure, dispatcher
  failure). No `external_item.secret` selected; `WHERE
  external_item.user_id = $1` scopes per-user. No UI wired (per
  scope) — Phase 4 (Settings) and Phase 5 (Dashboard trust strip)
  are the consumers.

### Next up
- **Plaid Production access review** for Fidelity (deprioritized) —
  Plaid has no OAuth integration with Fidelity in production; filing
  doesn't help. Re-check Plaid Dashboard > OAuth institutions every
  few months in case the situation changes.
- **Provider-neutral column rename** (cleanup) — `plaid_account_id`
  / `plaid_security_id` / `plaid_investment_transaction_id` columns
  are reused for SnapTrade IDs (UUIDs don't collide). Renaming to
  `provider_*_id` is honest but not load-bearing.
- **Phase 3-pt3** — per-goal coaching detail page. Real data is
  flowing now (was the original gating constraint); needs brainstorm
  + spec to define drilldown shape.
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
