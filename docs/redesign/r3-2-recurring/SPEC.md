# Phase R.3.2 — Recurring SPEC

**Goal:** Rewrite `/recurring` to adopt the prototype's calendar-window IA (group active outflows by next-charge date, not PFC category), add an Active/Cancelled tab affordance, preserve hike-alert + inflows + recently-cancelled signals, and restyle in Foothold tokens with the editorial Plan-eyebrow header pattern. Second of six R.3 per-page sweep sub-phases.

**Date**: 2026-05-10
**Branch**: `feat/r3-2-recurring` (cut from `feat/redesign`)
**Bundle reference**: [claude-design-context/foothold-recurring.jsx](../../../claude-design-context/foothold-recurring.jsx)
**Depends on**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) (precedent — calendar→category IA flip mirrors goals→cards flip)
**Estimate**: ~3-4 days

---

## Locked decisions

Eight high-leverage decisions were locked via `AskUserQuestion` during brainstorming. These are immutable for R.3.2; revisiting them requires a new SPEC pass.

1. **IA framing**: Calendar windows (prototype wholesale). Active outflows group by `predictedNextDate` into THIS WEEK / LATER THIS MONTH / NEXT MONTH / BEYOND. Replaces the post-2026-05-06 PFC-category IA.
2. **Hike alerts**: Banner above calendar windows. Amber-bordered block at top of Active tab; renders only when `hikes.length > 0`. Mirrors R.3.1 elevated-state and Phase 5 trust-strip restraint.
3. **Status filter UI**: Tabs lite (Active / Cancelled). Two-tab client island only. No Flagged tab (would need new "flagged" definition); no Snoozed tab (would need new schema column + UX, both out-of-scope).
4. **Inflows**: Keep below calendar windows in the Active tab. Payroll IS recurring; `Net monthly` KPI implies inflows exist.
5. **Cancelled scope**: Active tab carries the 90d ambient mini-section ("did my cancel work?" verification). Cancelled tab carries the full TOMBSTONED archive (no age limit), sorted by `lastDate` desc.
6. **Page eyebrow**: "Plan" — locked by `nav-routes.ts:42` placement under the Plan sidebar group, NOT the prototype's "Records".
7. **Freshness strip**: Yes, mirror R.3.1 / R.2. Right-side of `<RecurringPageHeader>`: `formatFreshness(getSourceHealth(userId))`. Headline "Synced 5m ago" + optional caveat. Reuses Phase 3-5 reliability layer; no new query.
8. **Summary KPI strip**: Hybrid 3-stat — Monthly outflow / Net monthly / Next charge (merchant + amount sub-line). Drops prototype's "Annualized" + "Active count"; drops current page's standalone "Monthly inflow" cell (folded into Net monthly).

### Auto-locked during design (non-blocking)

- **Streams with `null` predictedNextDate** are dropped from calendar windows. Plaid leaves the field null when prediction confidence is too low; bucketing them creates fake structure. They still count toward the Monthly outflow KPI via `monthlyCost(stream)`.
- **Trend indicator threshold**: ±5%. `trendIndicator(stream)` returns `'up'` if `lastAmount > averageAmount * 1.05`, `'down'` if `< 0.95`, else `'flat'`. Returns `'flat'` if either field is null.
- **Past-dated `predictedNextDate` streams** are dropped from calendar windows (defensive: Plaid sometimes lags refreshing past predictions).

---

## North Star

`/recurring` should read top-to-bottom as: "what's about to charge me, what already raised its price on me, what's coming in to cover it, and what I successfully killed." Operational, not analytical. Date-driven, not category-driven. The prototype's calendar-of-upcoming-outflows framing is the right mental model for an operator who's deciding whether to cancel something before the next debit hits.

---

## IA — final layout

```
PLAN — Recurring                                    Synced 5m ago
                                                    (caveat if any)

[ MONTHLY OUTFLOW ]   [ NET MONTHLY ]   [ NEXT CHARGE ]
   $4,287.40             +$1,213.60        Wed May 14
   12 outflows           inflows minus     Netflix · $15.99

[ Active | Cancelled ]   ← tabs, default Active

═══════════════ ACTIVE TAB ═══════════════

⚠ N hike alerts                              ← only if hikes > 0
   AWS · personal      $38.42 → was $14.20
     +170% · +$24.22/mo
   Equinox             $248.00 → was $215.00
     +15% · +$33.00/mo

THIS WEEK · Wed → Sat · $271.99 total       ← group header
   Netflix             Wed May 14   monthly  $15.99/mo  ↗
   Patreon · Kurz...   Thu May 15   monthly  $12.00/mo  —
   Equinox             Sat May 17   monthly  $248.00/mo ↗

LATER THIS MONTH · May 19 → 26 · $238.40
   ...

NEXT MONTH · Jun 01 → Jun 30 · $2,670.00
   ...

LATER · Jul 18 → Jan 18 · $695.00            ← only if beyond > 0
   Amex Platinum · annual   Jul 18  annual  $695.00/mo

INFLOWS · 2 streams · $5,501.00/mo           ← only if inflows > 0
   Acme Payroll        Bi-weekly             $5,461.00/mo
   Vanguard div        Quarterly                $40.00/mo

RECENTLY CANCELLED · 2 streams · last 90d    ← only if recentCancelled > 0
   Medium · last hit Apr 12   $5.00/mo
   Audible · last hit Mar 03  $14.99/mo

═══════════════ CANCELLED TAB ═══════════════

ALL CANCELLED · 14 streams · all-time
   Medium · last hit Apr 12   $5.00/mo
   Audible · last hit Mar 03  $14.99/mo
   ... (full TOMBSTONED list, sorted by lastDate desc)
```

### Empty state

Unchanged from current page (`getRecurringStreams(userId).length === 0`):

```
[Repeat icon]
Not enough history yet
Plaid needs 60–90 days of transaction data to detect
subscriptions, payroll, and bills. Connecting more accounts
shortens the wait.
[Connect more accounts] →
```

Editorial chrome around the icon may be tweaked in T6 polish; copy is locked.

---

## Final component map

### New (8 components + 1 helper file = 9 files)

| Path | Type | Purpose |
|---|---|---|
| `src/components/recurring/recurring-page-header.tsx` | server | Eyebrow "Plan" + h1 + freshness strip; mirrors `<GoalsPageHeader>` from R.3.1 |
| `src/components/recurring/recurring-summary-strip.tsx` | server | 3-cell KPI row: Monthly outflow / Net monthly / Next charge |
| `src/components/recurring/recurring-tabs.tsx` | **client** | Active / Cancelled tab island; takes `active` + `cancelled` server-rendered children. Only client island in R.3.2. |
| `src/components/recurring/hike-alert-banner.tsx` | server | Amber-bordered block wrapping `<HikeAlertRow>` list; renders only when hikes > 0 |
| `src/components/recurring/calendar-windows.tsx` | server | Renders 3 (or fewer) `<CalendarWindowGroup>` sections from `groupByDateWindow` output |
| `src/components/recurring/inflows-section.tsx` | server | Eyebrow + list of inflow `<StreamRow>`s; renders only when inflows > 0 |
| `src/components/recurring/recently-cancelled-section.tsx` | server | 90d window TOMBSTONED list, low-emphasis chrome (preserve current opacity-60) |
| `src/components/recurring/cancelled-archive-list.tsx` | server | Full TOMBSTONED list (Cancelled tab body), no 90d filter |
| `src/lib/recurring/calendar-windows.ts` (+ `.test.ts`) | pure | `groupByDateWindow`, `pickNextCharge`, `trendIndicator` |

### Modified (3 files)

| Path | Change |
|---|---|
| `src/app/(app)/recurring/page.tsx` | Wholesale rewrite: editorial header, KPI strip, tab composition. Preserves `<EmptyState>` verbatim. |
| `src/components/recurring/stream-row.tsx` | Foothold token restyle (drop shadcn defaults); add `nextDate` + `trend` cells for calendar-window context; add new `variant: 'cancelled-archive'`; logic untouched |
| `src/components/recurring/hike-alert-row.tsx` | Foothold token restyle to match banner context; logic untouched |

### Deleted (1 file + 1 export)

| Path | Reason |
|---|---|
| `src/components/recurring/recurring-overview.tsx` | Replaced by direct composition in `page.tsx` |
| `src/lib/recurring/analysis.ts::groupByCategory` | No longer called after `<RecurringOverview>` deletion. `isHikeAlert`, `monthlyCost`, `hikeRatio`, `frequencyToMonthlyMultiplier` survive — still used by hike banner + summary strip + stream rows. |

### Reused unchanged

`getRecurringStreams`, `getMonthlyRecurringOutflow`, `frequencyToMonthlyMultiplier`, `getSourceHealth`, `formatFreshness`, `isHikeAlert`, `hikeRatio`, `monthlyCost`, `humanizeCategory`, `formatCurrency`, `formatPercent`.

---

## Data flow

Single page-level `Promise.all`:

```ts
const [streams, monthlyOutflow, health] = await Promise.all([
  getRecurringStreams(session.user.id),
  getMonthlyRecurringOutflow(session.user.id),
  getSourceHealth(session.user.id),
]);
```

Synchronous derivations in `page.tsx`:

```ts
const today           = new Date();
const activeOutflows  = streams.filter(s => s.direction === 'outflow' && s.isActive);
const activeInflows   = streams.filter(s => s.direction === 'inflow'  && s.isActive);
const hikes           = activeOutflows.filter(isHikeAlert);
const recentCancelled = streams.filter(isRecentlyCancelled).sort(byLastDateDesc);
const allCancelled    = streams.filter(s => s.status === 'TOMBSTONED').sort(byLastDateDesc);
const windows         = groupByDateWindow(activeOutflows, today);
const nextCharge      = pickNextCharge(activeOutflows);
const monthlyInflow   = activeInflows.reduce(/* existing logic, see page.tsx */);
const netMonthly      = monthlyInflow - monthlyOutflow;
const freshness       = formatFreshness(health, { now: today });
```

`<RecurringTabs>` receives both tabs as server-rendered children (RSC element trees, NOT functions or config-of-functions — strike-3 watch from CLAUDE.md "Don't pass functions across the server→client boundary in config props"):

```tsx
<RecurringTabs
  active={
    <>
      {hikes.length > 0 && <HikeAlertBanner streams={hikes} />}
      <CalendarWindows windows={windows} />
      {activeInflows.length > 0 && <InflowsSection streams={activeInflows} />}
      {recentCancelled.length > 0 && <RecentlyCancelledSection streams={recentCancelled} />}
    </>
  }
  cancelled={<CancelledArchiveList streams={allCancelled} />}
/>
```

### Drilldown contract (preserved verbatim from current page)

Each interactive `<StreamRow>` carries a stretched-`<Link>` to `/transactions?q=<merchantName||description>&from=<6mo>`. Predicate at `stream-row.tsx:91-103`. Falls through to non-interactive `<li>` when neither `merchantName` nor `description` is populated. Cancelled archive rows are presentational (no drilldown — dead streams shouldn't invite "show me activity").

### Mobile responsive

Same approach as R.3.1: Foothold tokens flow naturally; no `<MobileList>` wrapping. Calendar windows are scroll-revealed. Tab island works at all breakpoints (just two pills).

---

## Pure-helper specs

### `groupByDateWindow(streams, today): { thisWeek, laterThisMonth, nextMonth, beyond }`

**Bucketing rules** (UTC date math, mirrors `walkBackTrajectory` from R.3.1):

- `thisWeek`: streams whose `predictedNextDate` falls between today (inclusive) and end-of-this-Sunday (inclusive)
- `laterThisMonth`: streams whose date falls between next-Monday (inclusive) and last-day-of-current-month (inclusive)
- `nextMonth`: streams whose date falls in the next calendar month (entire month, inclusive both ends)
- `beyond`: streams whose date falls AFTER end-of-next-month (typically annual fees). **Renders as the "LATER" calendar window section** below NEXT MONTH; group sub-line uses min/max date range from the bucket. Only renders when `beyond.length > 0`.
- **Dropped**: streams with `predictedNextDate === null` OR with a date in the past (`< today`)

**Sort within buckets**: by `predictedNextDate` ascending.

### `pickNextCharge(streams): { stream, dateIso } | null`

Returns the stream with the earliest non-null, non-past `predictedNextDate`. Returns `null` if no such stream exists.

### `trendIndicator(stream): 'up' | 'down' | 'flat'`

- `lastAmount > averageAmount * 1.05` → `'up'`
- `lastAmount < averageAmount * 0.95` → `'down'`
- Otherwise → `'flat'`
- If either `lastAmount` or `averageAmount` is null → `'flat'`

---

## UAT criteria

Walked top-to-bottom during T6 polish reservation:

### Visual chrome
- [ ] Page header reads `Plan` (eyebrow) + `Recurring` (h1) + right-side `Synced Xm ago` (or "Sync pending" / "Stale" copy from `formatFreshness`)
- [ ] KPI strip shows 3 cells: Monthly outflow / Net monthly / Next charge — all using mono numerals + sub-line copy
- [ ] Tab pills `Active | Cancelled` are visible, default = Active

### Active tab content
- [ ] Hike banner renders ONLY when ≥1 hike present; absent at 0
- [ ] Hike banner uses amber-bordered block + restrained typography
- [ ] Calendar window groups render in order: This week → Later this month → Next month → Later (`beyond` bucket — annual fees, etc.)
- [ ] Empty calendar windows render no group header (silent) — incl. the optional "Later" group when no beyond-bucket streams exist
- [ ] Each row shows: merchant name + next date + frequency + amount + trend (↗↘—)
- [ ] Trend indicators match the ±5% threshold predicate
- [ ] Streams with `null` predictedNextDate do NOT appear in calendar windows
- [ ] Inflows section renders only when ≥1 inflow present
- [ ] Recently cancelled section renders only when ≥1 cancelled stream within 90d window
- [ ] Recently cancelled rows preserve the current opacity-60 / "last hit X" treatment

### Cancelled tab content
- [ ] Tab swap reveals full TOMBSTONED archive (all-time, no 90d filter)
- [ ] Sorted by `lastDate` desc (most recently cancelled first)
- [ ] Empty state if user has zero cancelled streams ever (rare, but render gracefully)

### Drilldown
- [ ] Clicking an active outflow row → `/transactions?q=<merchant>&from=<6mo-iso>` with results visible
- [ ] Clicking an active inflow row → same drilldown contract
- [ ] Cancelled rows (both 90d mini and full archive) are NOT clickable
- [ ] Hike banner rows preserve drilldown to `/transactions` for the hiked merchant

### Theme parity
- [ ] Dark mode walk: KPI strip + tabs + hike banner + calendar window groups + inflows + cancelled mini all render correctly
- [ ] Light mode walk: same
- [ ] Trend ↗↘ glyphs use `--semantic-caution` (or `--text-3` for flat) and read in both themes

### Reactivity
- [ ] After a sync that resolves a stream to TOMBSTONED, row migrates from active calendar window → recently cancelled (no hard refresh)
- [ ] After a sync that adds a new stream, row appears in the appropriate calendar window
- [ ] (`revalidatePath('/recurring')` already wired on sync action — verified in T5 commit)

### Boundary cases
- [ ] Today is a Sunday → today's stream falls in `thisWeek`
- [ ] Today is the last day of the month → today's stream falls in `thisWeek`, tomorrow's in `nextMonth`
- [ ] Annual stream 90d out → falls in `beyond` (or `nextMonth` if within next-month window)
- [ ] All-empty user (no active outflows, no inflows, no cancelled, no hikes) → calendar window section renders nothing visible; user sees just header + KPI strip with zero values

### Build + tests
- [ ] `npm run typecheck` clean
- [ ] `npm run test` passes (~+12 net cases)
- [ ] `npm run build` clean (27/27 pages, no RSC serialization errors)
- [ ] No new `'use client'` directives outside the expected ones (only `recurring-tabs.tsx` is added; existing client islands unchanged)

---

## Out of scope (explicit non-goals for R.3.2)

- **Snooze feature** (UX + schema column on `recurring_streams`) → R.4 or later
- **Manual recurring stream creation** ("Add manually" button in prototype) → no backend; deferred
- **"Find a charge" search bar** in toolbar → /transactions already covers this; deferred
- **Per-stream cancel action** from /recurring → no backend; user cancels via the underlying merchant; we just observe TOMBSTONED state
- **Annualized total KPI** → dropped in favor of Net monthly per Hybrid 3-stat decision
- **Active count KPI cell** → dropped (sub-line on Monthly outflow cell carries the count)
- **Trend indicator history chart** (sparkline per stream) → too heavy; ↗↘— glyph is sufficient
- **Cancelled tab pagination** → assume <100 cancelled streams per user; if a power user hits limits we add it later
- **Other R.3 routes** (Transactions, Investments, Simulator, Settings) → R.3.3–R.3.6
- **Mobile rebuild** → R.5

---

## Dependencies

**Upstream**:
- R.2 Dashboard shipped (provides `formatFreshness`, freshness strip pattern, editorial PageHeader precedent)
- R.3.1 Goals shipped (provides `<GoalsPageHeader>` exact pattern to mirror, archived-toggle pattern as reference for the tab island)
- Reliability Phase 3 shipped (`getSourceHealth(userId)` query)

**Downstream**:
- R.3.3 Transactions inherits the freshness propagation pattern + tab-island convention if it needs filter pills
- R.3.6 Settings already uses `getSourceHealth` (Phase 4); no impact

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `groupByDateWindow` off-by-one at week/month boundaries | **High** | Pure helper with explicit `today: Date` parameter; UTC date math; ~15 vitest cases including all four boundary edges |
| RSC boundary failure on `<RecurringTabs>` (strike 3 watch) | Medium | Tabs island takes ONLY server-rendered React element children. T5 commit message must include grep verification of `'use client'` files. Spec rules out functions in props at the SPEC level. |
| Stream-row variant explosion (4 variants now: outflow/inflow/cancelled/cancelled-archive) | Low | If switch grows further, T6 polish splits `<CancelledArchiveRow>` into its own file. The variant prop is the canary. |
| Drilldown predicate change accidentally breaks existing /recurring → /transactions UX | Low | Lift verbatim from current `stream-row.tsx:91-103`; do not touch the predicate logic during T3 |
| Sync revalidatePath('/recurring') not actually wired | Low | Verify in T5 commit message via `grep -rn "revalidatePath.*recurring" src/` |
| `null` predictedNextDate streams silently drop, user misses them | Low | Explicit SPEC decision in Auto-locked §; can add an "Unscheduled" section in T-polish if the count is non-trivial in real data |
| Cancelled archive list grows unbounded | Low | Out-of-scope: pagination. Assume <100 per user; revisit if hit |

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/recurring/calendar-windows.ts` | Unit (vitest) | ~15 (bucketing edges, null-date drop, past-date drop, picker, trend ±5%) |
| `src/lib/recurring/analysis.ts` | DELETED `groupByCategory` | −2 to −4 (depends on existing case count) |
| Component files | UAT only | 0 |
| `<RecurringTabs>` client island | UAT only | 0 (trivial useState) |

**Net**: +11 to +13 cases. Target post-R.3.2: 549 → ~560-562.

---

## Cross-references

- [docs/redesign/r3-2-recurring/PLAN.md](PLAN.md) — implementation plan (written next via writing-plans skill)
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) — precedent pattern
- [claude-design-context/foothold-recurring.jsx](../../../claude-design-context/foothold-recurring.jsx) — prototype reference
- [CLAUDE.md](../../../CLAUDE.md) — project orientation (especially Architecture > Editorial tokens, Lessons learned > server→client function props)
