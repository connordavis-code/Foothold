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

- **Phase 6.5 — /insights IA rework** (2026-05-05) — `/insights`
  becomes a latest-read + drilldown surface: serif narrative stays
  the hero, with a "What Claude saw" receipts grid below (conditional
  Spending/Drift/Goals/Recurring tiles linking into their detail
  pages) and an "Earlier weeks" footer using `?week=YYYY-MM-DD` deep
  links. `<GenerateButton>` is now 3-mode (generate/regenerate/back-
  to-current) and strips `?week=` on success. New shared utils
  (`firstSentence`, `formatWeekRange`) and pure-predicate modules
  (`week-param`, `button-mode`, `tile-visibility`, `pace`) — all
  vitest-tested. `getInsightSupplements` composes drift + goals +
  recurring into the receipts payload via live-recompute for past
  weeks (no schema change). Pace bug caught + fixed mid-walkthrough:
  savings goals with negative velocity and no `targetDate` now
  correctly report "behind". 175 vitest tests. Spec at
  `docs/superpowers/specs/2026-05-05-insights-ia-rework-design.md`.

- **Phase 6.6 — UI quality pass** (2026-05-05) — driven by an
  `impeccable critique` sweep across all 8 surfaces. Added
  [PRODUCT.md](PRODUCT.md) (register, users, brand personality,
  anti-references, 5 design principles) for impeccable + future-
  agent context. Extracted `.text-eyebrow` Tailwind utility (sweeps
  21 files where the recipe was inline). Standardized warning hue
  (`yellow-500` → `amber-500`). Killed the TrendChart rainbow
  with brand-tinted `--chart-1..6` derived from the 160-hue
  gradient + 40-hue paper-canvas families. Added shadcn
  `alert-dialog` primitive; gated `/goals` + `/simulator` delete
  behind it (P1 error prevention; sonner success/failure). Fixed
  `/simulator` `searchParams` to async Promise (Next 14 correctness;
  was the synchronous Next 13 shape). Tokenize-bridge for
  `/simulator` (the visible "design island" pre-Phase 6): in-
  component toast → sonner, hand-rolled buttons → shadcn
  `<Button>`, raw `bg-red-50/sky-50/amber-50` → tokens, page shell
  aligned with Phase 6 pattern (`mx-auto max-w-6xl px-4 py-6
  sm:px-8 sm:py-8`), eyebrow recipe normalized, ForecastChart
  height 220→280px. Sparkles glyph audit: kept on `/insights`
  GenerateButton + nav route only; replaced on `/insights` empty
  (Newspaper + "First read coming up"), `<InsightTeaserCard>`
  (BookOpen), `/dashboard` empty (Mountain — literal Foothold
  mark). 175 vitest tests; typecheck clean. Browser walkthrough
  confirmed clean.

- **Phase 6.7 — UI quality follow-on** (2026-05-05) — top-two
  deferred TODOs from the 6.6 impeccable critique. (1) Global `?`
  cheatsheet dialog: editorial Dialog, Global / /transactions /
  /simulator sections, key-pill labels, `shouldIgnore` predicate
  copied from `operator-shell.tsx` so `?` in inputs is untouched.
  Bindings live in `keyboard/bindings.ts` as a single const for
  future tooltip reuse. (2) `/transactions` operator gaps: tri-state
  select-all-visible header checkbox (indeterminate set via DOM
  property since React has no prop for it; click-on-indeterminate →
  select all, per locked decision); sonner-with-undo on bulk
  re-categorize, snapshotting per-row prior `overrideCategoryName`
  before the action fires (router.refresh would otherwise overwrite
  the source) and grouping the restore by prior category for
  N-bounded round-trips. Cross-page select-all out of scope. Spec at
  `docs/superpowers/specs/2026-05-05-phase-6.7-handoff.md`. 175
  vitest tests (no regressions); typecheck clean; browser
  walkthrough confirmed.

- **Phase 6.7-followon — polish + /drift IA rework** (2026-05-05) —
  three pieces driven from the "what's left" backlog. (1) `/investments`
  group ordering: groups now sort by aggregate market value desc
  (was Map insertion order, which was near-correct only when sorting
  by Value). (2) `humanizeCategory` consolidation: 12 local copies
  collapsed into a single `src/lib/format/category.ts` module with
  joiner-word casing fix ("Food and Drink", "Bank of America" — was
  "Food And Drink") and unification of one outlier sentence-case
  shape on /drift; 10 vitest specs cover the casing rules. (3) `/drift`
  IA rework via `impeccable shape` (brief at
  `docs/superpowers/specs/2026-05-05-drift-ia-rework-design.md`):
  `<ElevatedTile>` becomes `<Link>` to `/transactions?category=<pfc>&from=<weekStart>&to=<weekEnd>`;
  the 6-line trend chart gives way to a horizontal bar leaderboard
  (`buildLeaderboard()` pure function + 9 vitest specs; new
  `<Leaderboard>` component renders current-week bar + baseline tick
  + ratio per cat, sorted by ratio desc, capped at 8 rows, single
  foreground hue + amber for elevated rows); `TrendChart` deleted
  (sole consumer gone). Flag history table preserved untouched.
  /drift walkthrough confirmed. 210 vitest tests; typecheck clean.

- **DESIGN.md** (2026-05-05) — generated via `impeccable document`
  (Stitch format, YAML frontmatter + six-section body). Captures
  tokens, named rules (160/40 hue, single-hue elevated, restrained
  accent floor, mono-numeral, borders-not-shadows, editorial card
  default), and do/don't list. Pair with [PRODUCT.md](PRODUCT.md)
  for the full brief. Creative North Star: "The Operator's Field
  Notebook." Future surfaces should reference [DESIGN.md](DESIGN.md)
  as the visual contract — operator decisions live in PRODUCT.md.

- **Polish carry-over batch** (2026-05-05) — four items from the
  6.6 critique's deferred TODO list, all bounded:
  (1) `/drift` flag-history "Week ending" date format `2026-04-28`
  → `Apr 28`, formatted in UTC so YYYY-MM-DD calendar dates don't
  drift in non-UTC client locales (`c1536cc`).
  (2) `/investments` `<TypePill>` rainbow collapsed from 5 hues
  (blue/orange/emerald/rose/muted) to a single muted tone — text
  label is the affordance, per DESIGN.md Restrained Floor Rule
  (`d75b974`).
  (3) Empty-state headlines across `/transactions`, `/investments`,
  `/goals`, `/recurring` rewritten to name the cause (matching
  /drift's `<SparseEmptyState>` "Not enough history yet" canonical
  pattern) instead of restating the symptom (`40963e3`).
  (4) `c` keystroke opens the bulk re-categorize picker on
  `/transactions` (Phase 6.7 deferred bonus). Lifted to controlled
  state on `<CategoryPicker>`; `<BulkActionBar>` owns the keystroke
  + open-state, auto-gated by mount lifecycle (`f775934`).
  218 vitest tests; typecheck clean.

- **Code review + fixes** (2026-05-05) — `gsd-code-reviewer` deep audit
  of forecast/security/cron core (64 files, see
  [docs/reviews/2026-05-05-REVIEW.md]) produced 22 findings (4
  Critical, 11 Warning, 7 Info). 13 commits on main close 19 of them;
  3 explicitly deferred and acknowledged. UAT confirmed in browser
  against sandbox Wells Fargo data (see
  [docs/reviews/2026-05-05-UAT-checklist.md]).
  - **Critical fixed:** C-04 `2cc4edb` (digest escapeHtml apostrophe);
    C-03 `fde00a8` (webhook KEY_CACHE size cap + negative cache for
    failed kid lookups, anti-amplification);
    C-02 `86c871a` (insights isEmpty contract — empty week no longer
    routes to Anthropic);
    C-01 `9cc87a9` (forecast engine consumes raw PFC — Architecture B,
    drops query-layer recurring subtraction loop with lifecycle
    off-by-one + floor-at-0 information loss).
  - **Warning fixed:** W-03+I-07 `97bbfb5` (ILIKE wildcard escape
    + drop dead `?? sql\`true\`` fallback);
    W-10 `4754dbb` (SEMI_MONTHLY/ANNUALLY amount rescale on cadence
    collapse);
    W-01 `51e573e` (goal-projection ETA cash gate — skip months
    where `endCash - monthlyContribution < 0`);
    W-04 `5729b9a` + `74d0100` (defer inline sync from
    exchangePublicToken so plaintext access_token in JS heap drops
    from ~30s to ~50ms; null token reference in syncItem finally);
    W-09 `c2f20d9` (signed math through override chain;
    `clampForDisplay` clips inflows/outflows/byCategory at engine
    output, startCash/endCash unclamped).
  - **Info fixed:** I-02 `a03e907` (crypto key-length in error msg).
  - **Docs:** `d1c3472` (REVIEW.md + 3 specs); `6e05e1b` (UAT
    checklist).
  - **Deferred (acknowledged):** W-05/W-06 (multi-Plaid-item state,
    blocked on Plaid Production approval); W-07 (digest 24h window
    edge); W-08 (narrative cache canonical JSON, needs lib choice);
    W-02/W-11 (minor / no-code-change).
  - **Tests:** 175 → 218 vitest (+43 regressions). New architecture
    notes added above: "Forecast engine consumes raw PFC totals" and
    "Forecast override appliers use signed math". Specs preserved at
    `docs/superpowers/specs/2026-05-05-{c01,w04,w09}-*-design.md`.

- **/goals IA rework** (2026-05-05) — `/goals` reshapes from an
  equal-weight 2-col tile grid into a sectioned pace leaderboard
  (Behind pace above On pace, severity-sorted within each).
  `<GoalRow>` renders name + ProgressBar (with ideal-pace tick for
  savings, projected-month tick for caps) + lever copy + verdict
  pill, with stretched-`<Link>` drilldown on spend-cap rows only.
  Asymmetric drill is intentional: caps map to a clean
  `category=<PFC>&from=<monthStart>` /transactions filter; a savings
  account-scope drill would surface paychecks and transfers as
  noise. Pure predicates in `src/lib/goals/pace.ts`: `paceVerdict`
  (over / behind / on-pace / hit) + `severityKey` (bucketed
  100/50/25/20). Page collapsed -188/+5 lines as display logic
  moved into reusable components. 238 vitest tests (+20). Spec at
  `docs/superpowers/specs/2026-05-05-goals-ia-rework-design.md`.

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
- **Per-page IA rework** for /recurring — Phase 6 shipped a visual
  refresh; /insights, /drift, and /goals got their IA reworks
  (2026-05-05). /recurring is the only remaining surface — daily-use
  companion to /transactions, "what's quietly draining me?" is its
  PRODUCT.md question. Phase-sized; use the `impeccable shape →
  craft` loop that worked on /drift and /goals.
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
