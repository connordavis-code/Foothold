# Phase 4 — Predictive Layer (Cash Simulator + AI Narration)

**Date:** 2026-05-04
**Status:** Approved by user, ready for implementation planning
**Author:** Brainstorm session (Claude Opus 4.7 + cdhome)
**Related artifacts:**
- Mockups: `.superpowers/brainstorm/88762-1777942075/content/`
- Existing pattern references: `src/app/(app)/drift/`, `src/app/(app)/insights/`, `src/lib/db/queries/goals.ts`
- Phase 5 testing precedent: commit `5adf667`

---

## 1. Summary

Phase 4 ships a **cash forecast engine** and a **what-if simulator** built on top of it, plus an **AI coaching narrative** that explains each scenario. The user can save and name scenarios for repeated reference and comparison-over-time. All three pieces ship together as Phase 4. Investment-asset what-if (modeling growth of holdings) is explicitly deferred to **Phase 4-pt2** because it requires independent modeling decisions that would otherwise sprawl this phase.

A small concurrent change in the same milestone: **sidebar grouping** (Today / Plan / Records) and a **brand text fix** ("Finance" → "Foothold"). Bundled because adding `/simulator` to a flat 9-item sidebar was the trigger; ships as a separate small commit so it can be reverted independently.

---

## 2. Goals & Non-goals

**Goals**
- Answer "given my current pace, when do I hit my emergency fund goal?" (forecast)
- Answer "if I cut $300/mo dining + add a tax refund in April, how does that change?" (simulator)
- Answer "if I add a hypothetical $30k house downpayment goal, when would I reach it?" (hypothetical goals)
- Persist scenarios with names so they can be reopened, compared mentally, and refined over time
- Generate a 3-5 sentence coaching summary on demand for any scenario

**Non-goals (explicit YAGNI)**
- Investment what-if (growth, allocation, dividends) — Phase 4-pt2
- Side-by-side comparison of multiple saved scenarios — saved-scenario dropdown covers most of the value
- Mobile-redesigned layout — page must function on narrow viewports but not be redesigned for them
- Sharing scenarios via URL — single-user scope; saved list serves the need
- AI summary on the baseline (no overrides) scenario — suppressed; that's `/insights` territory
- Auto-regeneration of AI narrative on every override edit — too expensive, prose would be stale before user finishes editing

---

## 3. Architecture

Four logical components with clean responsibilities:

```
┌────────────────────────────────────────────────────────────┐
│  /simulator page (Next.js server component)                │
│  Loads history + scenarios; passes to client; renders UI   │
└────────────────────────────────────────────────────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Forecast    │  │ Forecast engine  │  │ Scenario         │
│ queries     │  │ (pure function,  │  │ persistence      │
│ (DB reads)  │  │  client/server)  │  │ (`scenario`      │
│             │  │                  │  │  table + CRUD)   │
└─────────────┘  └──────────────────┘  └──────────────────┘
                          │
                          ▼
       ┌──────────────────────────────────────────┐
       │  Simulator client UI (React)              │
       │  ├─ Override editor (left, 7 sections)    │
       │  ├─ Forecast chart (center)               │
       │  └─ Goal diff cards                       │
       └──────────────────────────────────────────┘
                          │ on demand
                          ▼
       ┌──────────────────────────────────────────┐
       │  AI coaching narrative                    │
       │  (server action → Anthropic Haiku 4.5;    │
       │  cached in `forecast_narrative` table)    │
       └──────────────────────────────────────────┘
```

**Key architectural decisions:**

- **Engine is pure & client-runnable.** `projectCash(history, overrides) → MonthlyProjection[]`. No DB, no fetch, no `Date.now()`. Same code runs in the browser (instant override response) and on the server (consistent input for AI). Testable in isolation.
- **Scenarios are the unit of saved state**, not "current overrides." Each scenario = a named, persistent override bag.
- **AI narration sits OUTSIDE the engine** — consumes engine output, doesn't influence it. Means a regression in narration logic can't break the math, and vice versa.
- **No `is_baseline` column.** Baseline = absence of overrides (`overrides = {}`). Avoids two valid representations for the same state.

**File layout (new):**

```
src/lib/forecast/
  ├─ engine.ts                # projectCash() pure function
  ├─ overrides.ts             # types + helpers for override application
  └─ scenarios.ts             # server actions (CRUD)

src/lib/db/queries/
  └─ forecast.ts              # history slice readers

src/lib/anthropic/
  └─ forecast-narrative.ts    # prompt builder + Anthropic call

src/app/(app)/simulator/
  ├─ page.tsx                 # server component
  └─ ...                      # client subcomponents

src/components/simulator/
  ├─ override-editor.tsx
  ├─ forecast-chart.tsx
  ├─ goal-diff-cards.tsx
  └─ narrative-panel.tsx
```

---

## 4. Data Model

### 4.1 New tables

```ts
// src/lib/db/schema.ts (additions)

export const scenarios = pgTable('scenario', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),                    // e.g. "Cut dining + April refund"
  description: text('description'),                // optional longer note
  overrides: jsonb('overrides').$type<ScenarioOverrides>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => ({
  userUpdatedIdx: index().on(t.userId, t.updatedAt.desc()),  // saved-scenarios list
}));

export const forecastNarratives = pgTable('forecast_narrative', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
  inputHash: text('input_hash').notNull(),         // SHA-256 of prompt input
  narrative: text('narrative').notNull(),
  generatedAt: ts('generated_at').notNull().defaultNow(),
}, (t) => ({
  scenarioHashIdx: uniqueIndex().on(t.scenarioId, t.inputHash),
}));
```

Why a separate `forecast_narrative` table (not extending `insight`): the `insight` table is keyed by `(user_id, week_start)`, wrong shape for scenarios. Forcing scenario narratives in would either need a nullable scenario column (two row types in one table) or a fake `week_start`. Cheap to add a focused table; pays off in clarity.

### 4.2 The `ScenarioOverrides` type

```ts
type ScenarioOverrides = {
  horizonMonths?: number;  // default 12

  // 1. Per-category monthly $ change. Negative = cut, positive = increase.
  categoryDeltas?: Array<{
    categoryId: string;
    monthlyDelta: number;
    startMonth?: string;  // YYYY-MM, default = next month
    endMonth?: string;    // YYYY-MM, default = horizon end
  }>;

  // 2. One-time cash events.
  lumpSums?: Array<{
    id: string;            // client-generated stable id (React keys)
    label: string;         // "Tax refund" / "Vet bill"
    amount: number;        // positive = inflow, negative = outflow
    month: string;         // YYYY-MM
  }>;

  // 3. Recurring stream changes — pause existing, edit existing, add hypothetical.
  recurringChanges?: Array<{
    streamId?: string;     // existing stream OR null when action='add'
    action: 'pause' | 'edit' | 'add';
    label?: string;
    amount?: number;
    direction?: 'inflow' | 'outflow';
    cadence?: 'weekly' | 'biweekly' | 'monthly';
    startMonth?: string;
    endMonth?: string;
  }>;

  // 4. Income delta (separated from categoryDeltas because income isn't categorized).
  incomeDelta?: { monthlyDelta: number; startMonth?: string; endMonth?: string };

  // 5. Hypothetical goals — don't exist in DB, live only inside the scenario.
  hypotheticalGoals?: Array<{
    id: string;            // client-generated
    name: string;
    targetAmount: number;
    targetDate?: string;   // YYYY-MM-DD
    monthlyContribution?: number;
  }>;

  // 6. Edits to existing real goals — DO NOT mutate the goal table; only override in projection.
  goalTargetEdits?: Array<{
    goalId: string;
    newTargetAmount?: number;
    newTargetDate?: string;
    newMonthlyContribution?: number;
  }>;

  // 7. Skip specific upcoming recurring instances (narrowed scope — see §4.3).
  skipRecurringInstances?: Array<{
    streamId: string;
    skipMonth: string;     // YYYY-MM — skip this stream's instance in this month
  }>;
};
```

### 4.3 Engine output shape

```ts
type MonthlyProjection = {
  month: string;                          // YYYY-MM
  startCash: number;
  inflows: number;
  outflows: number;
  endCash: number;                        // primary chart series
  byCategory: Record<string, number>;
  goalProgress: Record<string, number>;   // dollars accumulated per goal id (real + hypothetical)
};

type GoalImpact = {
  goalId: string;                         // real goal id OR `"hypo:<uuid>"` for hypothetical
  name: string;
  baselineETA: string | null;             // YYYY-MM, or null if "never within horizon"
  scenarioETA: string | null;
  shiftMonths: number;                    // negative = sooner, positive = later
};
```

### 4.4 Note on the 7th override type (narrowed)

The original "edit any planned transaction" idea narrowed to **`skipRecurringInstances`** because:
- There's no `planned_transaction` table — transactions are historical
- Recurring streams generate implicit future occurrences
- Skipping a specific month covers the most useful real case ("skip my August Netflix charge")
- Adding "create arbitrary planned transactions" would need a planning UI + planning storage — its own phase

---

## 5. Forecast Engine

### 5.1 Baseline strategy: recurring + trailing 3-month median

For each future month within the horizon:
- **Recurring streams**: project as-known (real schedules from `recurring_stream` table)
- **Non-recurring outflows per category**: trailing 3-month median (outlier-robust; one big repair doesn't dominate)
- **Recurring income**: project as-known
- **Non-recurring income**: trailing 3-month median

Why median over mean: one $800 vet bill in March shouldn't make the engine think "Veterinary" is now a $300/mo recurring spend. Median ignores the spike. With low transaction volume per category, this matters.

**Insufficient history fallback** — if a category has fewer than 3 historical months of data, the engine uses whatever months exist (`median([single value]) === single value`; `median([])` → `0`). For the *whole* user having `< 3 months` of any history (e.g., just connected Plaid), the projection still runs but the chart is annotated `"Forecast confidence is low — based on only N months of history"` until 3 months accumulate.

Why this strategy over linear trend or seasonal:
- **Linear trend** is a footgun with limited history (3 months → noise dominates; can produce nonsense like negative spending or runaway growth)
- **Seasonal** (month-of-year) requires 12+ months of history; not viable until 2027

The engine signature stays the same when the strategy upgrades — when 12 months of real Plaid data are available, swap to a hybrid (recurring + seasonal blend) without touching the simulator UI.

### 5.2 Override application order (deterministic)

```
1. compute baseline projection
   ├─ recurring streams projected as-is
   ├─ non-recurring outflows = trailing 3-month median per category
   ├─ recurring income = projected as-is
   └─ non-recurring income = trailing 3-month median

2. apply categoryDeltas      → modify non-recurring outflows per affected month
3. apply incomeDelta         → add to inflows per affected month
4. apply recurringChanges    → pause / edit / add streams
5. apply skipRecurringInstances → subtract specific stream instances by month
6. apply lumpSums            → add to inflows or outflows for the target month
7. compute goal projections  → using goalTargetEdits + hypotheticalGoals
```

Steps don't conflict because they target different parts of the model:
- `categoryDeltas` only touch non-recurring outflows
- `recurringChanges` only touch recurring streams
- `skipRecurringInstances` runs after `recurringChanges` (you can both edit a stream's amount AND skip its August instance)
- `lumpSums` are one-time, additive
- Goal projections consume the final cash projection (read-only at that point)

### 5.3 Engine guarantees

- **Pure function.** No DB, no fetch, no `Date.now()` (current month passed in as input).
- **Deterministic.** Same inputs → same outputs. Required for the AI prompt cache to work.
- **Negative `endCash` is not sanitized.** If the scenario projects you running out of cash, the chart shows it dipping below zero — that's the entire point.
- **Goals that don't reach target within horizon** get `ETA = null`, displayed as "—".

---

## 6. UI Structure (`/simulator` page)

UI is a **starting hypothesis, expected to be refined in use.** Initial version optimizes for the comprehensive 7-override scope and the read patterns we expect; revision is planned after a few weeks of real use.

### 6.1 Page shape — "balanced v3"

Two-column body under a quiet header:

```
┌─ Header ────────────────────────────────────────────┐
│  Simulator                          [Reset] [Save] ⋯ │
│  "Cut dining + April refund" · updated 2h ago ▾     │
└─────────────────────────────────────────────────────┘
┌─ Overrides (240px) ─┬─ Forecast + impact + AI ──────┐
│  Categories      2  │   Cash forecast               │
│    Dining −$300/mo  │   12 months · Apr 2027 $24.8k │
│    Subs   −$45/mo   │   ───── chart ─────           │
│    + add            │                                │
│  Lump sums       1  │   Goals impact                │
│    Tax refund Apr   │   ┌──────┐ ┌──────┐           │
│    + add            │   │EF↓2mo│ │House │           │
│  Recurring       —  │   │Jun 26│ │Mar 29│           │
│  Income          —  │   └──────┘ └──────┘           │
│  Hypothetical    —  │                                │
│  Goal edits      —  │   Summary  [regenerate]       │
│  Skip recurring  —  │   "This scenario gets you..." │
└─────────────────────┴───────────────────────────────┘
```

### 6.2 Component breakdown

- **Header**: Title + scenario selector dropdown (with name + "updated Xh ago"). Reset (text link), Save (filled button — primary action), ⋯ (kebab menu with Delete).
- **Override editor** (left, 240px, always visible): 7 collapsible sections. Each section header shows a count badge (plain gray number, not a colored pill). Active items render as compact rows; inactive sections show "—".
- **Forecast chart** (right): 220px tall line chart via Recharts. Baseline (light gray dashed) + scenario (solid black). Subtle horizontal gridlines. No card border.
- **Goal diff cards** (right, 2-column grid): subtle bordered cards (`bg-muted/40`, light border). Top-right pill shows direction (`↓ 2 mo` for sooner, `hypo` for hypothetical). New ETA prominently sized (~18px). "was Aug 2026" as small footnote below.
- **AI summary** (right): soft container (same fill as goal cards), label + paragraph + "regenerate" link. Suppressed entirely on baseline scenario (replaced with `"Add overrides on the left to see how they'd shift your forecast."`).

### 6.3 Visual design principles

- **One color**: black for primary, grays for secondary. No blue/green/red/yellow accents (single small exception: the "↓ 2 mo" direction pill on goal cards uses `text-sky-700 bg-sky-50` for "sooner" — restrained accent).
- **Whitespace as divider** in the chart and override sections; bordered containers reserved for goal cards and AI summary.
- **No badge pills** in the override editor — counts are just gray numbers.
- **Header actions demoted** to text links except for Save (the one primary action).

### 6.4 Empty / first-time states + default-scenario behavior

- **No saved scenarios yet**: page shows a friendly empty state with a single "Create your first scenario" button. Default scenario name pre-filled ("Untitled scenario"). Override editor and chart still visible (chart shows baseline only).
- **Baseline scenario open**: Override editor empty across all 7 sections; chart shows baseline line only (no second line); goal cards show baseline ETAs only; AI panel suppressed (replaced with prompt to add overrides).
- **Default scenario on page load** (when user has saved scenarios): server component loads the **most recently updated** scenario for `userId` (`order by updated_at desc limit 1`) and renders with that scenario active. URL query param `?scenario=<id>` overrides the default — used for navigating directly to a specific scenario from elsewhere in the app.

### 6.5 Responsive behavior

Page must **function** on narrow viewports:
- Below `md` (768px): two-column collapses to single column. Override editor stacks on top of the chart.
- Mobile-redesigned layout (e.g., bottom-sheet override editor) is **out of scope** — defer until real use shows it's needed.

---

## 7. AI Coaching Narrative

### 7.1 When generation fires

**Manual button only.** First view of a scenario: "Generate AI summary" button. After generation: prose displayed inline with a quiet "regenerate" link in the corner. Same Phase 3-pt1 `/insights` pattern.

Not auto on every override edit — generation costs money and prose would be stale before user finishes editing.

### 7.2 Prompt input shape

Compact, structured. With 7 override types and comprehensive scope, raw JSON would balloon. The prompt builder normalizes:

```
You are a financial coach. Summarize this what-if scenario in 3-5 sentences.
Mention the top driver, one volatility/risk, and one actionable observation.

CURRENT STATE
- Cash: $13,400 across checking + savings
- Active goals: Emergency fund ($10k target, $4,200 saved), Travel fund ($3k, $1,800)

SCENARIO OVERRIDES
- Category cuts: Dining −$300/mo, Subscriptions −$45/mo
- Lump sums: Tax refund Apr 2026 +$2,400
- Hypothetical goals: House downpayment ($30k by Mar 2029)

PROJECTION DELTA (12mo)
- Baseline end: $19,400
- Scenario end: $24,800 (+$5,400)
- Min cash month: Sep 2026 at $7,200 (baseline: $9,800)

GOAL IMPACTS
- Emergency fund: Aug 2026 → Jun 2026 (2mo sooner)
- House downpayment (hypo): unreachable in baseline → Mar 2029 in scenario
```

~600 input tokens for a typical scenario; caps at ~1500 even with all 7 override types active.

### 7.3 Output shape

**One paragraph, 3-5 sentences, no structured fields.** Plain prose, third-person about the user's scenario. Prompt explicitly asks for:
1. Top driver of the change
2. One volatility / risk to watch
3. One actionable observation

Any output schema (JSON, structured fields, headings) would fight the casual coach voice and be more brittle to model variation.

### 7.4 Model + cost

**`claude-haiku-4-5-20251001`**. Reasons:
- Short prose summary is well within Haiku's competence
- ~10× cheaper than Sonnet, ~50× cheaper than Opus
- Phase 3 pattern is on-demand (low volume), but if auto-regenerate is ever turned on, Haiku keeps the bill negligible

Approximate per-call cost: ~$0.001 at current Haiku pricing for ~1500 input + 200 output tokens.

### 7.5 Cache key

`inputHash = SHA-256(stringify(overrides) + "|" + historyFingerprint)`

Where `historyFingerprint` is a deterministic string of:
- `today's date` (YYYY-MM-DD, not timestamp — stays stable within a day)
- `count of transactions` for the user
- `max(transaction.occurredAt)` truncated to YYYY-MM-DD
- `max(plaidItem.lastSyncedAt)` truncated to YYYY-MM-DD

Consequences:
- **Edit overrides** → hash changes → cache miss → regenerate
- **Same scenario tomorrow** → date in fingerprint changes → hash changes → cache miss (narrative refreshes as data arrives)
- **New transactions sync mid-day** → transaction count changes → hash changes → cache miss
- **Same scenario re-rendered five times in the same day with no new data** → all cache hits

### 7.6 Failure handling

| Failure | Behavior |
|---|---|
| API down / rate limit | Show last cached narrative + small `"couldn't refresh — using version from <date>"` line. Don't error the page. |
| Empty response or refusal | Fallback string `"Couldn't generate a summary for this scenario."` + regenerate link. |
| No overrides yet (baseline) | Suppress AI panel entirely; show `"Add overrides on the left to see how they'd shift your forecast."` |

All errors logged via existing `logError('forecast.narrative.generate', err, { scenarioId })` → surfaces in the daily digest. (Op name uses `.generate` suffix to match the dot-namespaced convention from Phase 5: `cron.digest.send`, `webhook.handler`, etc.)

---

## 8. Sidebar Grouping + Brand Fix

`src/components/nav/app-sidebar.tsx`: convert flat `navItems` array to grouped structure.

```ts
const navGroups = [
  { label: 'Today', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/insights', label: 'Insights', icon: Sparkles },
    { href: '/drift', label: 'Drift', icon: Activity },
  ]},
  { label: 'Plan', items: [
    { href: '/goals', label: 'Goals', icon: Target },
    { href: '/recurring', label: 'Recurring', icon: Repeat },
    { href: '/simulator', label: 'Simulator', icon: LineChart /* TBD: pick distinct from Sparkles */ },
  ]},
  { label: 'Records', items: [
    { href: '/transactions', label: 'Transactions', icon: Receipt },
    { href: '/investments', label: 'Investments', icon: TrendingUp },
  ]},
];
// Settings stays separate at bottom.
```

Brand text: `"Finance"` → `"Foothold"` (matches `usefoothold.com` domain).

**Ships as a separate small commit** within the Phase 4 milestone so it can be reverted independently if it doesn't feel right.

---

## 9. Error Handling

| Layer | Failure mode | Behavior |
|---|---|---|
| Forecast queries | Missing history slice | Return empty arrays; engine handles "no history" gracefully (baseline = current cash, flat) |
| Engine | Bad inputs (e.g. negative `horizonMonths`) | Throw; server actions zod-validate beforehand so this only fires in dev |
| Scenarios CRUD | DB error | Server action returns `{ ok: false, error }`; UI toasts and keeps local state |
| AI narration | API down / refusal | Show last cached + small "couldn't refresh" hint (see §7.6) |

All errors logged via existing `logError(...)` from `src/lib/logger.ts` — surfaces in the daily digest.

---

## 10. Testing Strategy

Following the Phase 5 pattern (commit `5adf667`): pure-function targets are colocated `*.test.ts` files, run via `npm test`, all stay under ~500ms total.

**Vitest unit tests (high-value, easy to write):**
- **Engine**: synthetic histories + scenarios → expected `MonthlyProjection[]`. Cover: empty history; single recurring stream; baseline vs single override; baseline vs all 7 override types stacked; edge cases (negative end cash; goal that never reaches target)
- **Override application order**: verify `categoryDelta` + `recurringChange` don't conflict; `lumpSum` adds to the right month; `goalTargetEdit` doesn't mutate the underlying goal projection for *other* scenarios
- **Goal projection math**: exact-month-hit, never-hits-within-horizon, hypothetical-with-no-monthly-contribution edge case
- **Prompt builder**: given fixed scenario + projection, prompt string is deterministic
- **Cache key generator**: same inputs → same hash; one byte different → different hash

**NOT tested:**
- AI narration output itself (non-deterministic — tested manually by reading the prose)
- Recharts rendering (third-party, not our logic)
- Server action plumbing (thin wrappers; engine + queries get the real coverage)

---

## 11. Migration

Two new tables: `scenarios`, `forecast_narratives`. Per CLAUDE.md's `db:push` lesson:

```bash
# In drizzle.config.ts: flip strict from true to false
npm run db:push       # apply both tables
# Flip strict back to true
```

No data migration needed — both tables start empty.

---

## 12. Out of Scope (explicit YAGNI)

Recap of intentional omissions from §2:

- Investment what-if (Phase 4-pt2 — own brainstorm focused on modeling depth)
- Side-by-side comparison of multiple saved scenarios
- Mobile-redesigned layout
- Sharing scenarios via URL
- AI summary on baseline scenario
- Auto-regeneration of AI narrative on every override edit

---

## 13. Operational Notes

- **UI is a starting hypothesis, expected to be refined in use.** Plan-of-record: ship initial UI, use for ~2-4 weeks, then a focused UI revision pass once the awkward interactions reveal themselves.
- **Sidebar grouping ships in same milestone but as a separate small commit** (revertable in isolation).
- **Phase 4.5 (separate, future):** broader IA review — should `/drift` fold into `/dashboard`? Should `/insights` and the new AI summary share a surface? Worth its own brainstorm later.

---

## 14. Decisions Log

Chronological record of choices made and rationale, in case future-you wonders "why did we do X?":

| # | Decision | Rationale |
|---|---|---|
| 1 | Phase 4 = cash + AI; investments → pt2 | Investment modeling forces invented assumptions (returns, rebalance, taxes) → its own design |
| 2 | Comprehensive simulator scope (7 override types) | User explicitly chose comprehensive after scope tradeoff was presented |
| 3 | Saved + named scenarios (new `scenario` table) | Comprehensive overrides take effort; losing on refresh would sting; enables compare-over-time |
| 4 | Dedicated `/simulator` page (Option A) | Matches `/drift` pattern; single URL; all controls co-located |
| 5 | Bundle sidebar grouping into Phase 4 + roadmap deeper IA pass for later | User flagged nav complexity; lightweight grouping is ~30 min; deeper pass needs own brainstorm |
| 6 | `skipRecurringInstances` (narrowed 7th override) | No `planned_transaction` table exists; broader scope = own phase |
| 7 | No `is_baseline` column | Baseline = absence of overrides; one source of truth |
| 8 | `jsonb` overrides column | Each override bound to scenario; never queried independently |
| 9 | Pure engine function | Testable in isolation; runnable client + server; deterministic |
| 10 | Strategy A (recurring + trailing 3-month median) | Honest with limited data; outlier-robust; engine signature unchanged when strategy upgrades |
| 11 | Median over mean | One vet bill spike shouldn't dominate per-category projections |
| 12 | UI v3 "balanced" (between v1 noisy and v2 too-quiet) | User feedback: too noisy → too quiet → goals get visual back; chart + editor stay quiet |
| 13 | Manual generate button for AI (not auto) | Cost; staleness during edits; matches Phase 3 pattern |
| 14 | Haiku 4.5 for narrative generation | Sufficient for short prose; ~10× cheaper than Sonnet |
| 15 | Separate `forecast_narrative` table (not extending `insight`) | Wrong schema shape; would pollute existing table |
| 16 | History fingerprint in cache hash | Auto-stales narrative when underlying data changes; predictable invalidation |

---

## 15. Open Questions / Known Unknowns

- **Icon for `/simulator` in sidebar** — `LineChart` vs `FlaskConical` vs `Zap`. Pick during implementation; not design-blocking.
- **Default horizon** — currently 12 months. Worth revisiting once real Plaid data flows; might find 6 months is the sweet spot for daily-decision relevance.
- **AI prompt voice** — coach? analyst? friend? Worth iterating on once real prose lands; the design only specifies content, not tone.
- **Scenario rename UX** — implicit assumption is inline-edit on the dropdown header. Confirm during UI build.

---

## 16. Implementation Sequence (sketch — to be detailed by writing-plans)

Suggested wave structure for the implementation plan:

1. **Foundation**: schema additions (`scenarios`, `forecast_narratives`); `db:push`; engine skeleton + signatures; queries for history slices
2. **Engine + tests**: full `projectCash` implementation with comprehensive vitest coverage (this is where the majority of value + risk lives)
3. **Scenarios CRUD**: server actions for save/load/delete; integration with engine
4. **UI shell**: `/simulator` page, header, scenario selector, layout grid; uses engine via client wrapper
5. **Override editor**: one section at a time (categories first as the most common; lump sums second; build remaining 5 in subsequent commits)
6. **Chart + goal diff**: Recharts integration; baseline + scenario series; goal cards
7. **AI narration**: prompt builder + tests; Anthropic call; caching; failure handling; UI panel
8. **Sidebar grouping + brand**: separate commit
9. **Polish + responsive**: empty states, narrow-viewport collapse, smoke tests
