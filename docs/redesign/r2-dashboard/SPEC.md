# Foothold Redesign — Phase R.2 Dashboard

**Date locked**: 2026-05-10
**Parent spec**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 master)
**Bundle reference**: [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx)
**Branch**: `feat/r2-dashboard` (cut from `feat/redesign`)
**Status**: Decisions locked via brainstorming session 2026-05-10; ready for plan

---

## Scope

Rewrite the dashboard surface in the new Foothold visual identity. Three structurally distinct things in one phase:

1. **New identity restyle** of the 7 existing dashboard cards
2. **Two route folds** — `/drift` and `/insights` delete; their content lands on dashboard as a drift module and editorial brief card
3. **Genuinely new components** — 180-day net-worth trajectory with forecast uncertainty band, Runway KPI cell, freshness annotation pattern that R.3 will propagate everywhere

## North star (inherited from R.0)

> *"Where you stand, mapped honestly."*

Numbers as protagonist. Chrome restrained. Trajectory line and uncertainty band say "you are here, and this is where the math points" — not a prediction, an extrapolation rendered with calibrated humility.

---

## Locked decisions (2026-05-10 brainstorming session)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Phase scoping | One branch, atomic per-task commits matching R.1 | 8 task commits + UAT polish; single PR; spec's 1-week estimate; matches R.1 rhythm so reviewer pattern carries over |
| 2 | Forecast band data source | Reuse `projectCash()` + naive band | Historical half = `getNetWorthSparkline(90)`. Forecast half = linear interp between `projectCash` monthly endCash anchors. Band = σ × sqrt(t), σ = stddev of trailing-90-day daily net deltas. Returns null when historical < 60 points (honesty floor). Mathematically defensible; no engine rewrite |
| 3 | Runway definition | Net burn with "Net positive" fallback | `liquidBalance / median(monthly net outflow trailing 3mo) × 4.33 wks` when net-negative. Renders "Net positive" with sub "no runway risk" when income > outflow. Preserves 3-cell KPI strip |
| 4 | Weekly brief data source | Render existing `insight.narrative` as prose, compute stats live | No schema migration, no AI prompt rewrite. Stats grid (Spend/Income/Net) computed via new `getWeeklyBriefStats` query. Brief sequence № from new `getInsightSequenceNumber` query. Trade-off: lead paragraph quality depends on existing prompt — may need T8 polish or R.3 prompt-tune follow-on |
| 5 | Freshness annotation pattern | Aggregate text-only, page-level + section-level | Page header meta + hero fineprint render canonical "Fresh Nh ago · N sources". Sections render the same line when source freshness differs meaningfully. No per-number tooltips, no per-KPI annotations in R.2. Single helper `formatFreshness()` propagates to R.3 |

---

## Surface changes — what survives, what dies

### Routes

| Route | Fate | Redirect |
|---|---|---|
| `/dashboard` | Heavily restyled, becomes destination for /drift + /insights | — |
| `/drift` | Deleted (T4) | `/drift → /dashboard#drift` permanent |
| `/insights` | Deleted (T5) | `/insights → /dashboard#brief` permanent |
| `/insights/[week]` | Deleted (T5) | `/insights/:week → /dashboard?week=:week` permanent |

### Lost affordances (accepted regressions)

- **Drift drilldowns** — per R.0 locked decision #3, `<ElevatedTile>` clicks to `/transactions?category=&from=&to=` are dropped. T8 UAT check: revisit if friction emerges.
- **Drift flag history** — `<FlagHistoryList>` (the RSC-boundary bug client wrapper) deletes with the /drift route. Current-week only.
- **Drift 4-week trend chart** — already deleted in /drift IA rework; no migration needed.
- **/insights receipts grid** — already deleted in /insights IA rework; no migration needed.

### Preserved

- AI weekly brief generation (`forecast_narrative` cache, Anthropic Haiku 4.5, weekly Mon 04 UTC cron)
- `getDriftAnalysis()` query — unchanged shape; drift module consumes `currentlyElevated`
- `getLatestInsight()` query — unchanged
- `<GenerateButton>` server action — relocates to dashboard's brief card empty state
- All Reliability Phase 1–5 infrastructure (balance refresh, sync health classifier, source-health query, settings panel, trust strip)

---

## Task sequence (T1–T8)

Each task = one atomic commit. Commit message format: `feat(r2): <task summary>`.

### T1 — Page header restyle

**Ships:** `<PageHeader>` component renders eyebrow ("Today · Sat, May 10"), h1 "Dashboard", right-aligned meta strip ("Fresh 2h ago · 3 sources"). Replaces ad-hoc page padding/header in `src/app/(app)/dashboard/page.tsx`.

**TrustStrip integration:** `<TrustStrip>`'s healthy branch returns `null` (its content is absorbed into the page-header meta). Elevated and no-signal branches survive — render below the page header when present.

**Files:**
- `src/components/dashboard/page-header.tsx` [NEW]
- `src/components/sync/trust-strip.tsx` [MOD] — healthy branch returns null

### T2 — NetWorthHero with trajectory + uncertainty band

**Ships:** `<NetWorthHero>` server component renders net worth count-up (eased over 900ms), monthly delta, fineprint with `formatFreshness()`. `<HeroTrajectory>` client island renders 180-day SVG (90d history + today vertical + 90d forecast + uncertainty band + position dot + contour watermark via `<FootholdMark>`).

**Forecast math:**
- Historical: `getNetWorthSparkline(userId, 90)` — call-site bump from 30 to 90.
- Forecast: `forecastDailySeries(startLiquidCash, projection, 90)` — linear interp across `projection[0..2].endCash` from existing `projectCash` output.
- Band: `uncertaintyBand(historicalSeries, forecastSeries)` — σ = stddev of historical daily deltas; band = forecast ± σ × sqrt(daysOut). Returns `null` when historical < 60 points.
- Render rule: when `uncertaintyBand()` returns `null`, render line only.

**Files:**
- `src/components/dashboard/net-worth-hero.tsx` [NEW]
- `src/components/dashboard/hero-trajectory.tsx` [NEW] — `'use client'`
- `src/lib/forecast/trajectory.ts` [NEW] — pure helpers
- `src/lib/forecast/trajectory.test.ts` [NEW] — ~12 cases
- `src/lib/db/queries/dashboard.ts` [MOD] — `getNetWorthSparkline` caller bumps 30 → 90
- `src/components/dashboard/hero-card.tsx` [DEL]
- `src/components/dashboard/sparkline.tsx` [DEL]

### T3 — KPI strip (Liquid · EOM · Runway)

**Ships:** `<Kpis>` 3-cell strip replaces `<SplitCard>`. Adds Runway computation.

**Runway formula:** `computeRunway(liquidBalance, history)`:
- `medianNetMonthly = median(trailing 3 complete months: outflows - inflows)`
- If `medianNetMonthly <= 0`: return `null` (caller renders "Net positive" + "no runway risk")
- Else: `liquidBalance / medianNetMonthly × 4.33` wks

**Files:**
- `src/components/dashboard/kpis.tsx` [NEW]
- `src/lib/forecast/runway.ts` [NEW] — pure helper
- `src/lib/forecast/runway.test.ts` [NEW] — ~6 cases
- `src/components/dashboard/split-card.tsx` [DEL]

### T4 — Drift module + /drift route delete

**Ships:** `<DriftModule>` horizontal-bar leaderboard. No drilldowns. Renders only when `currentlyElevated.length > 0`. Headline pluralizes ("1 category" / "N categories"). Per-row bar fill clamped at 10×+ ratio. Outer wrapper carries `id="drift"`.

**Route delete:**
- `rm -rf src/app/(app)/drift/`
- `next.config.js` redirect: `/drift → /dashboard#drift` permanent
- Grep `src/lib/**/actions.ts` for `revalidatePath('/drift')` and rewrite to `'/dashboard'`

**Files:**
- `src/components/dashboard/drift-module.tsx` [NEW]
- `src/components/dashboard/drift-flags-card.tsx` [DEL]
- `src/app/(app)/drift/` [DEL]
- `next.config.js` [MOD]
- `src/lib/**/actions.ts` [MOD] — audit revalidatePath calls

### T5 — Weekly brief editorial card + /insights route delete

**Ships:** `<WeekInsightCard>` editorial card. Eyebrow "Weekly Brief · № N · WeekStart—WeekEnd, YYYY". Lead paragraph (first `\n\n`-split chunk) renders in Fraunces italic at larger size. Body paragraphs in body size. Numeric tokens (`$X.YY`, `Nx`, `N×`) auto-wrapped in mono `<span class="num">` via regex. Stats grid (Spend/Income/Net) computed live. Foot signature + "Read full brief →" link with `?week=` deep-link param.

**Empty state:** when no insight for current week, renders "Generate brief" CTA via relocated `<GenerateButton>`.

**Route delete:**
- `rm -rf src/app/(app)/insights/` (includes `[week]/page.tsx`)
- `next.config.js` redirects: `/insights → /dashboard#brief`, `/insights/:week → /dashboard?week=:week`
- Grep `src/lib/**/actions.ts` for `revalidatePath('/insights')` and rewrite to `'/dashboard'`
- Grep `src/app/api/cron/digest/route.ts` for `/insights` links and rewrite to `/dashboard#brief`
- `<GenerateButton>` relocates from `src/components/insights/` to `src/components/dashboard/`

**Files:**
- `src/components/dashboard/week-insight-card.tsx` [NEW]
- `src/components/dashboard/generate-button.tsx` [MOVED from src/components/insights/]
- `src/lib/db/queries/insights.ts` [MOD] — adds `getWeeklyBriefStats` + `getInsightSequenceNumber`
- `src/components/dashboard/insight-teaser-card.tsx` [DEL]
- `src/app/(app)/insights/` [DEL]
- `next.config.js` [MOD]
- `src/lib/**/actions.ts` [MOD] — audit revalidatePath
- `src/app/api/cron/digest/route.ts` [MOD] — rewrite link

### T6 — Goals + recurring + activity restyle

**Ships:** `<GoalsRow>`, `<RecurringList>` (renamed from `<UpcomingRecurringCard>`), `<RecentActivity>` (renamed from `<RecentActivityCard>`) restyled per prototype. Pure presentational rewrites — no new queries, no logic changes.

**Preserved:**
- `<GoalsRow>` per-goal drilldown to `/goals/[id]`
- `<RecentActivity>` mobile tap-to-edit (presentational at md+, interactive at <md)
- `<RecurringList>` future-occurrence filter window

**Files:**
- `src/components/dashboard/goals-row.tsx` [MOD]
- `src/components/dashboard/recurring-list.tsx` [NEW] — replaces upcoming-recurring-card.tsx
- `src/components/dashboard/recent-activity.tsx` [NEW] — replaces recent-activity-card.tsx
- `src/components/dashboard/upcoming-recurring-card.tsx` [DEL]
- `src/components/dashboard/recent-activity-card.tsx` [DEL]

### T7 — Freshness annotation helper

**Ships:** `formatFreshness(input: FreshnessInput): FreshnessText` pure helper. Page header and hero consume it. Locks the R.3 propagation contract.

**Contract (R.3 must not deviate):**

```ts
export type FreshnessInput = {
  sources: Array<{ name: string; lastSyncAt: Date | null }>;
  now?: Date;
};

export type FreshnessText = {
  headline: string;         // "Fresh 2h ago · 3 sources" | "Syncing · 3 sources" | ...
  caveat: string | null;    // optional second line
};

export function formatFreshness(input: FreshnessInput): FreshnessText;
```

**State rules:**

| Input state | Headline | Caveat |
|---|---|---|
| All sources fresh (≤ policy window) | `"Fresh Nh ago · N sources"` (N=age of oldest source — conservative anchor per Phase 5) | `null` |
| Some sources stale (> policy window but < 7d) | `"Last sync Nh ago · N sources"` | `null` |
| Some sources never synced (cold start) | `"Syncing · N sources"` | `"Numbers will fill in shortly"` |
| Zero sources | `"No sources connected"` | `null` |
| Some sources require user action | Headline per majority state | `"N source(s) need reconnect"` |

Reuses `formatRelative()` from `src/lib/format/date.ts` for the age substring.

**Files:**
- `src/lib/format/freshness.ts` [NEW]
- `src/lib/format/freshness.test.ts` [NEW] — ~10 cases
- `src/components/dashboard/page-header.tsx` [MOD] — consume helper
- `src/components/dashboard/net-worth-hero.tsx` [MOD] — consume helper

### T8 — UAT polish

Reserved for fixes surfaced during the UAT pass below. Analogous to R.1's 3 polish commits.

---

## Final component map

```
src/components/dashboard/
  page-header.tsx          [NEW T1]
  net-worth-hero.tsx       [NEW T2]
  hero-trajectory.tsx      [NEW T2] 'use client'
  kpis.tsx                 [NEW T3]
  drift-module.tsx         [NEW T4]
  week-insight-card.tsx    [NEW T5]
  generate-button.tsx      [MOVED T5 from src/components/insights/]
  recurring-list.tsx       [NEW T6]
  recent-activity.tsx      [NEW T6]
  goals-row.tsx            [MOD T6]

  hero-card.tsx            [DEL T2]
  sparkline.tsx            [DEL T2]
  split-card.tsx           [DEL T3]
  drift-flags-card.tsx     [DEL T4]
  insight-teaser-card.tsx  [DEL T5]
  upcoming-recurring-card.tsx [DEL T6]
  recent-activity-card.tsx    [DEL T6]

src/components/sync/
  trust-strip.tsx          [MOD T1] — healthy branch returns null

src/lib/forecast/
  trajectory.ts            [NEW T2]
  trajectory.test.ts       [NEW T2]
  runway.ts                [NEW T3]
  runway.test.ts           [NEW T3]

src/lib/format/
  freshness.ts             [NEW T7]
  freshness.test.ts        [NEW T7]

src/lib/db/queries/
  dashboard.ts             [MOD T2] — sparkline 30 → 90
  insights.ts              [MOD T5] — getWeeklyBriefStats, getInsightSequenceNumber

src/app/(app)/dashboard/page.tsx    [MOD per task]
src/app/(app)/drift/                [DEL T4]
src/app/(app)/insights/             [DEL T5]
src/app/api/cron/digest/route.ts    [MOD T5]
next.config.js                       [MOD T4 + T5]
src/lib/**/actions.ts                [MOD T4 + T5] — revalidatePath audits
```

---

## Tests

Target: 447 → ~475 passing post-R.2.

| File | Cases | Covers |
|---|---|---|
| `src/lib/forecast/trajectory.test.ts` | ~12 | Interp correctness, sqrt(t) widening, <60 points returns null band, all-zero deltas, boundary days |
| `src/lib/forecast/runway.test.ts` | ~6 | Net positive → null, net negative → wks formula, zero burn → Infinity, trailing-3mo median (zero-fill convention) |
| `src/lib/format/freshness.test.ts` | ~10 | Each input state in the table, conservative-anchor headline N, age formatting via `formatRelative` reuse |

**Query-level integration:** `getWeeklyBriefStats` and `getInsightSequenceNumber` are validated via UAT (dashboard rendering matches manual SQL spot-check). Matches Phase 3-pt3 query pattern.

**Pre-merge gates:**
- `npm run typecheck` clean
- `npm run lint` clean
- `npm run test` 100% pass
- `npm run build` clean (run **after** killing `next dev` — CLAUDE.md lesson)
- Manual UAT (below) — all checked

---

## UAT criteria

Each item = manual browser check. T8 polish iterates until all pass.

### Hero (T2)
- [ ] Net worth count-up fires once on mount, ~900ms, eases out
- [ ] Trajectory line renders ~180 daily points
- [ ] "You are here" dot at history/forecast boundary
- [ ] Today vertical line dashed
- [ ] Uncertainty band renders when ≥60 days of history; absent otherwise
- [ ] Band widens visibly toward +90 day edge
- [ ] Forecast line dashed; history line solid
- [ ] Dark mode: chart legible on `--bg` deep-forest
- [ ] Empty state: sparkline `[]` swaps to caveat "Trend appears once accounts have 30 days of history"
- [ ] `prefers-reduced-motion` respected (count-up disabled, line drawn statically)

### KPIs (T3)
- [ ] Three cells: Liquid · EOM · Runway
- [ ] Runway shows "N wks" when net-burning, "Net positive" when income > outflow
- [ ] Sub-text correct ("across N accounts", "−$X from today", "at current burn" / "no runway risk")
- [ ] Mono numerals on all values
- [ ] Dark mode parity

### Drift module (T4)
- [ ] Renders only when `currentlyElevated.length > 0`
- [ ] Headline pluralizes correctly
- [ ] Bar fill clamped at 10×
- [ ] Baseline tick visible per row
- [ ] Cool reference rows in `--text-3`
- [ ] No drilldown affordance (no hover, no cursor change)
- [ ] `/drift` navigates to `/dashboard#drift` and scrolls to module
- [ ] No JS errors (RSC boundary clean)

### Weekly brief (T5)
- [ ] Eyebrow renders sequence + date range
- [ ] Lead paragraph in Fraunces italic, larger size
- [ ] Body paragraphs body size
- [ ] Numeric tokens auto-wrap in mono
- [ ] Stats grid: Spend / Income / Net, positive Net in `--positive`
- [ ] "Read full brief →" link present
- [ ] `/insights` → `/dashboard#brief`
- [ ] `/insights/2026-05-04` → `/dashboard?week=2026-05-04` (renders that week)
- [ ] Email digest links rewritten (test via local cron trigger)
- [ ] Empty state: "Generate brief" CTA when no insight for current week

### Goals / recurring / activity (T6)
- [ ] Goals row matches prototype 2-up grid; `/goals/[id]` drilldown preserved
- [ ] Recurring list: 7-day window, mono amounts, calendar icon per row
- [ ] Recent activity: date · desc + raw · cat · amount; mobile tap-to-edit preserved
- [ ] All restyled cards use Foothold tokens (no rogue slate)

### Freshness (T7)
- [ ] Page header right-meta: "Fresh Nh ago · N sources"
- [ ] Hero fineprint: same line plus optional caveat
- [ ] Stale → "Last sync Nh ago" swap
- [ ] Cold-start → "Syncing · N sources"
- [ ] Empty → "No sources connected"

### Regression
- [ ] `/transactions`, `/investments`, `/goals`, `/recurring`, `/settings`, `/simulator` unaffected
- [ ] All `revalidatePath` audits applied (no 404s on action-triggered redirects)
- [ ] Email digest rendering unchanged visually
- [ ] All `prefers-reduced-motion` checks pass

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| RSC boundary failure (strike 3 → architecture-level guard) | Low | `<HeroTrajectory>` is the only `'use client'` component. Audit props for functions pre-merge T2 |
| Plaid Balance Path B honesty | Medium | Freshness helper labels "Fresh" for ≤ 12h per Phase 2 policy. Acceptable per Path B's "as of X hours ago" frame |
| Email digest links break post-redirect | Medium | T5 grep `src/app/api/cron/digest/route.ts` and rewrite same commit. Trigger local cron to verify |
| Build vs dev simultaneous run | Low | UAT requires `npm run dev`. Don't run `npm run build` in same shell; use `typecheck` per CLAUDE.md lesson |
| Hero forecast misleads on new install | High | `getNetWorthSparkline` returns `[]` for installs < 30 days. Hero swaps to caveat. Same for band (returns null when <60 daily points). Mitigation = feature-disable, not feature |
| Weekly brief prose reads stilted at Fraunces lead size | Medium | T8 UAT decision. Prompt rewrite is R.3 concern, not R.2 |
| Drift drilldown gap surfaces friction | Medium | T8 + 1-week-of-use UAT. If yes, R.3 re-adds row-click → `/transactions` filter |

---

## Open questions for T8 polish

- **Lead paragraph at Fraunces size**: if existing prompt's first paragraph doesn't sing at editorial size, options are (a) accept some weeks won't be great, (b) defer prompt-tune to R.3. Don't conflate with R.2.
- **Position-dot pulse on hero trajectory**: prototype shows static dot. Pulse motion is in scope for R.6 polish per R.0 spec. Keep static in R.2 unless polish has clear win.
- **Drift module headline brand-voice**: prototype says "3 categories running hot this week" — sentence-style. Alternative: smallcaps "DRIFT · 3 HOT" eyebrow style for terseness. Decide at T8.
- **Empty-state copy for "no drift"**: prototype hides the module entirely when no hot categories. Confirm during T8 — alternative would be a quiet "Spending steady this week" muted line.

---

## Cross-references

- Master spec: [docs/redesign/SPEC.md](../SPEC.md)
- Bundle reference: [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx)
- R.1 PLAN (precedent for execution rhythm): [docs/redesign/r1-foundation/PLAN.md](../r1-foundation/PLAN.md)
- Architecture invariants: [CLAUDE.md](../../../CLAUDE.md) — see Auth split, RSC boundary lessons, Plaid Balance Path B, freshness policy
- Phase 5 trust strip precedent (conservative-anchor decision): CLAUDE.md "Phase 5 (Dashboard trust strip)" section
