# Phase R.3.4 — Investments SPEC

**Goal:** Wholesale-IA restyle of `/investments` per the Foothold Design bundle. Replace the existing operator-tier holdings table (sortable columns + group-by toggle) with the prototype's editorial IA: portfolio hero → performance chart with range tabs → allocation bar+legend → Positions/Accounts tabbed holdings → recent activity. Land a new `portfolio_snapshot` table + walkback infrastructure so the performance chart has meaningful data from day one (estimated for pre-snapshot history, real going forward). Fourth of six R.3 per-page sweep sub-phases.

**Date**: 2026-05-11
**Branch**: `feat/r3-4-investments` (cut from `feat/redesign` post-R.3.3 merge at `cb71ea1`)
**Bundle reference**: [claude-design-context/foothold-investments.jsx](../../../claude-design-context/foothold-investments.jsx)
**Depends on**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r3-3-transactions/SPEC.md](../r3-3-transactions/SPEC.md) (closest IA precedent — but R.3.4 is wholesale, not hybrid), [docs/redesign/r3-2-recurring/SPEC.md](../r3-2-recurring/SPEC.md) (KPI/freshness/page-header precedent), [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) (page-header pattern)
**Estimate**: ~5-6 days (heavier than R.3.3 due to new schema + cron piggyback + walkback math)

---

## Resumption context (for fresh sessions)

This SPEC was brainstormed via two rounds of `AskUserQuestion` locking 7 high-leverage decisions. **No code is on this branch yet.** The PLAN is not yet written — pick up by invoking `superpowers:writing-plans` with this SPEC as the source. Expected PLAN length: ~2000-2400 lines (R.3.4 adds new database infrastructure, beyond R.3.3's chrome-only changes).

**Parallel work caveat**: A separate Claude session has uncommitted changes touching `src/lib/db/schema.ts`, `src/lib/format/date.ts`, and most files under `src/lib/db/queries/`. Before running T1's schema-append step, verify `git status` is clean (their work landed) OR coordinate the append manually to avoid merge conflicts. The new `portfolio_snapshot` table can be appended at the bottom of `schema.ts` to minimize conflict surface, but the parallel agent may also be adding indexes there.

---

## Locked decisions

### Round 1 (scope + chart + allocation + activity)

1. **Performance chart strategy**: **Add `portfolio_snapshot` table now.** New daily snapshot table written during sync. Walkback through `investment_transactions` for pre-snapshot history (estimated portion). Real values for snapshot dates going forward. Chart accepts the trade: ~5-6 day implementation cost, day-1 chart renders from walkback rather than empty-state. **Rejected** "drop chart entirely" (loses the prototype's strongest editorial move) and "no walkback / empty until 30 days accrue" (boring + non-narrative for the first month).
2. **Scope**: **Wholesale prototype IA.** Drop group-by toggle (`<GroupByToggle>`), drop sortable columns (`<HoldingsTable>` click-to-sort), drop the operator-tier table layout. Adopt prototype's Positions/Accounts tab switch + per-position 3-line rows. **Explicit regression**: the Phase 6.7 follow-on "group-by-value sort on /investments" — preserved per the handoff doc's audit guidance — is INTENTIONALLY DROPPED here. The user knowingly traded operator-tier interactivity for the prototype's editorial clarity. This is different from R.3.3, where operator-tier features were preserved (hybrid scope).
3. **Allocation classifier**: **Group by `securities.type`.** Pure helper `classifyHolding(securityType: string | null): AllocationClass` returning one of `'Equity' | 'ETF' | 'Mutual fund' | 'Bond / fixed income' | 'Cash' | 'Other'`. Honest about what Plaid actually labels positions as. Bar+legend sorted by value desc with `'Other'` pinned last (mirrors /recurring's category sort with "Other" pinned bottom).
4. **Recent activity**: **Keep as separate section below Holdings.** Restyled token-swap of `<InvestmentTxnsTable>`; eyebrow renamed to "Recent activity" (was "Recent investment activity"). Prototype doesn't model this section, but recent buys/sells/dividends are useful operator context. Section sits beneath the Positions/Accounts tabs.

### Round 2 (backfill + eyebrow + day-delta)

5. **Snapshot backfill**: **Walkback + flag as estimated for backfilled days.** Hybrid strategy: walkback through `investment_transactions` for pre-snapshot dates, real snapshots going forward. Chart distinguishes the two via dashed line (estimated) vs solid line (real) with a single visual seam at the earliest snapshot date. Tooltip on the seam explains "Earlier values estimated from recorded transactions." Over time the dashed portion shrinks as snapshots accumulate.
6. **Page eyebrow**: **"Long horizon"** per prototype. First R.3 sub-phase where eyebrow diverges from sidebar group (sidebar is "Records" per [nav-routes.ts:50](../../../src/components/nav/nav-routes.ts)). Brand voice trumps sidebar consistency here — the prototype's editorial mindset ("Quiet by design — markets move, but the plan doesn't") is more load-bearing than nav-group consistency. Document this break in the SPEC so future sweeps don't re-litigate it.
7. **Day delta**: **Add as a 4th range tab (`1D`).** Drops from hero entirely (per prototype's quiet voice). 1D tab special-cases the chart: only 2 data points exist (yesterday's close from `securities.closePrice`, today's value from `holdings.institutionPrice`). When no holdings have a `closePrice`, the 1D tab is disabled / hidden. Per-row day delta on `<PositionsList>` is preserved.

### Auto-locked during design (non-blocking; revisitable via `fix(r3.4):`)

- **Snapshot trigger location**: New pure function `recordPortfolioSnapshot(userId)` called from the sync dispatcher's success path (`src/lib/sync/dispatcher.ts`) — NOT a new dedicated cron route. Rationale: piggyback on existing nightly + manual sync flow, no new bearer auth, snapshot lifecycle tied directly to sync success. Snapshots upsert on `(user_id, snapshot_date)` so multiple syncs per day collapse to one row (latest wins).
- **Walkback policy**: Only `investment_transactions` with `type IN ('transfer', 'cash', 'fee')` count toward walkback. Buys, sells, dividends, cancels are zero-sum at the portfolio-total level (internal asset class changes at the broker). Per `<InvestmentTxnsTable>`'s comment confirming Plaid's `amount` = cash-sweep delta (positive = cash OUT of broker), not portfolio-total delta. Pure helper handles this filter.
- **Snapshot shape**: Totals-only per day per user (`{user_id, snapshot_date, total_value, total_cost_basis}`) — NOT per-holding. Per-holding history is a future-phase concern; portfolio-level chart is the only R.3.4 consumer.
- **Cost-basis movement**: `total_cost_basis` captured alongside `total_value` so future-phase cost-basis trajectory analysis is possible without a separate migration. Walkback for cost basis is trivial (cost basis only moves on buys/sells; small enough that walkback is cheap to add later).
- **Range tab default**: `1M` per prototype. When no snapshots OR no qualifying walkback txns exist, render empty-state copy "Trajectory builds with daily snapshots" with the range tabs still visible but inert.
- **Recharts chart implementation**: Two `<Line>` series — `valueEstimated` (dashed) and `valueReal` (solid) — sharing the same X axis. Recharts skips null values so each line renders only where its data is non-null. Seam date appears in both arrays so the two lines visually connect.
- **Holdings drilldown**: Position rows are presentational only in R.3.4 — no detail drawer, no click target. Consistent with the prototype's "long horizon" voice (rebalancing isn't a 30-second operator move). Account-tab account cards are also presentational. Future phase can add a drilldown if needed.
- **Mobile**: Single responsive component (no separate `<MobileInvestments>` consumer of `<MobileList>` post-rewrite). The new `<HoldingsView>` and chart components render fluidly across breakpoints via Tailwind's responsive utilities. Drops the current `<MobileList>` consumption — `<MobileList>`'s config-of-functions shape is a strike-2 RSC-boundary risk we avoid by not introducing new consumers in R.3.4. (Existing /drift + /transactions consumers stay.)

---

## North Star

`/investments` should read as the **long-horizon, quiet-by-design view of where money is working**. Numbers as protagonist. Portfolio value is the largest object on the page. The performance chart frames "are we on the long path?" through restrained color (single accent line, dashed for estimated history). Allocation reads as a single horizontal bar — not a pie chart — so the question "where is my money exposed?" lands in one glance. Holdings render as Positions (flat by value desc) or Accounts (broker-grouped cards); the operator can flip between the two without losing context, and the chrome stays minimal so the data is the protagonist.

---

## IA — final layout

```
LONG HORIZON                                          Fresh 5m ago · 3 sources
Investments
Where your money is working. Quiet by design —
markets move, but the plan doesn't.

═══════════════ HERO ═══════════════

PORTFOLIO VALUE · TODAY                      COST BASIS         HOLDINGS
$  246,841.92                                $ 218,930.13       7
                                                                · 3 accounts
   ↑ $27,911.79 · +12.75% since cost basis

═══════════════ PERFORMANCE ═══════════════

PERFORMANCE                                            [1D] [1M] [3M] [6M] [1Y] [5Y]
1M change · +$3,421.82

[ -------dashed--------↘────solid───↗──── ]      ← seam where snapshots begin
                                                     dashed = estimated walkback
                                                     solid = recorded snapshot

  $223,420                              $250,260
  (range min)                           (range max)

═══════════════ ALLOCATION ═══════════════

ALLOCATION
How it's distributed

[━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━]      ← stacked horizontal bar segments

  ● US Equities          42.1%      $103,920
  ● ETFs                 31.8%      $78,520
  ● Bonds                12.3%      $30,460
  ● Mutual funds          9.6%      $23,710
  ● Cash                  4.2%      $10,231

═══════════════ HOLDINGS ═══════════════

HOLDINGS                                                [Positions] [Accounts]
By position

  VTI       Vanguard Total Stock Market           142.32 sh   $268.40
  ETF · Wealthfront                              $ 38,182.20    ↑ $1,842.21 · +5.13%

  VXUS      Vanguard Total International           88.42 sh    $64.12
  ETF · Wealthfront                              $  5,670.30    ↓ $-92.31 · -1.60%

  [...more positions, sorted by value desc...]

  CASH      Cash sweep                          1,842.91 sh     $1.00
  Cash · Wealthfront                             $  1,842.91    —

═══════════════ RECENT ACTIVITY ═══════════════

RECENT ACTIVITY · 12

  MAY 9 · FRI                                          ↑ $50.00
    DIVIDEND · VTI · Wealthfront                       +$50.00 · 0.1872 sh

  MAY 6 · TUE                                          ↓ -$2,500.00
    BUY · VTSAX · Fidelity 401k                        -$2,500.00 · 18.81 sh

  [...up to 20 rows, date-grouped...]

═══════════════ SIGNATURE FOOTER ═══════════════
(carries through from R.1)
```

### Empty state

Fires when `summary.accountCount === 0`:

```
[TrendingUp icon]
No brokerage connected yet
Link a brokerage, IRA, 401(k), or HSA via Plaid or SnapTrade
to see holdings, day moves, and recent activity here.
[Connect a brokerage →]
```

Token swap (foreground colors, surface tokens) but copy unchanged from current implementation.

### Sparse-data state

Fires when `summary.accountCount > 0` but `portfolioHistory.byRange['1M'].points.length === 0` (no walkback-qualifying transactions AND no snapshots yet):

```
PERFORMANCE                                            [1D] [1M] [3M] [6M] [1Y] [5Y]

Trajectory builds with daily snapshots
N/30 days collected.
```

Range tabs render but are inert (`disabled` attribute). When at least one snapshot OR one walkback-qualifying txn exists for the selected range, the chart renders normally.

---

## Final component map

### New (10 files: 4 components + 4 pure helpers + 1 schema row + 1 query)

| Path | Type | Purpose |
|---|---|---|
| `src/lib/db/schema.ts` (APPEND) | schema | New `portfolio_snapshot` table — see Database section. **Coordinated with parallel agent's schema work.** |
| `src/lib/investments/snapshots.ts` | db side-effect | `recordPortfolioSnapshot(userId): Promise<void>` — reads current holdings totals, upserts `(user_id, snapshot_date)`. Called from sync dispatcher's success path. |
| `src/lib/investments/walkback.ts` + `.test.ts` | pure | `walkbackPortfolio(currentValue, txns, daysBack): { date, value }[]` — anchor on today, walk back through filtered txn types. ~10 vitest cases. |
| `src/lib/investments/allocation.ts` + `.test.ts` | pure | `classifyHolding(securityType): AllocationClass` + `buildAllocation(holdings): AllocationSegment[]`. ~8 vitest cases. |
| `src/lib/db/queries/portfolio-history.ts` | query | `getPortfolioHistory(userId): Promise<PortfolioHistory>` — merges `portfolio_snapshot` rows + walkback for pre-snapshot dates. Returns `{ byRange: Record<RangeKey, RangeData> }`. UAT-validated; no separate test file. |
| `src/components/investments/investments-page-header.tsx` | server | Eyebrow "Long horizon" + h1 "Investments" + page sub + right-side freshness. Mirrors `<RecurringPageHeader>`/`<TransactionsPageHeader>`. |
| `src/components/investments/portfolio-hero.tsx` | server | Large portfolio-value display + cost-basis-delta line + cost-basis/holdings aside cells. |
| `src/components/investments/performance-chart.tsx` | **client** | Range tabs (1D/1M/3M/6M/1Y/5Y) + Recharts LineChart with dual `<Line>` (estimated/dashed + real/solid). Takes serializable `byRange` prop — NO functions. |
| `src/components/investments/allocation-section.tsx` | server | Horizontal stacked bar + legend. Pure data in, no state. |
| `src/components/investments/holdings-view.tsx` | **client** | Positions/Accounts tab toggle + both renderings. Takes serializable `holdings` + `accountsBreakdown` props. NO function props. |

### Modified (5 files)

| Path | Change |
|---|---|
| `src/app/(app)/investments/page.tsx` | Wholesale rewrite: new query set, new layout, freshness propagation. Adds `getSourceHealth` + `getPortfolioHistory` to the existing `Promise.all`. |
| `src/components/investments/investment-txns-table.tsx` | Token-swap restyle (border/bg tokens) + eyebrow renamed to "Recent activity". Date-grouped rendering adopted from R.3.3 `groupTransactionsByDate` pattern (reused, NOT redefined). |
| `src/components/investments/mobile-investments.tsx` | Token-swap restyle of the recent-activity mobile path. **NOTE**: Holdings mobile path removes its `<MobileList>` consumption in favor of the responsive `<HoldingsView>`; only the recent-activity `<MobileList>` consumption remains. |
| `src/lib/sync/dispatcher.ts` | After successful `syncItem(externalItemId)` for any item with investment-typed accounts, call `recordPortfolioSnapshot(userId)`. Wrap in try/catch + `logError` so a snapshot write failure doesn't fail the sync. |
| `src/lib/db/queries/investments.ts` | Possibly extend `getPortfolioSummary` shape (drop `dayDelta`/`dayDeltaPct` fields since 1D moves to chart; OR keep them since `<PositionsList>` per-row still uses `dayDelta`). Audit during T6 — minimal change expected. |

### Deleted (3 files)

| Path | Reason |
|---|---|
| `src/components/investments/group-by-toggle.tsx` | Wholesale IA drops the toggle (scope decision #2) |
| `src/components/investments/holdings-table.tsx` | Replaced by `<HoldingsView>`. The new Positions tab is a flat sorted-by-value list, no sortable column UI, no group-by toggle. |
| `src/components/investments/portfolio-summary.tsx` | Replaced by `<PortfolioHero>` (different shape: larger lead number, prototype-style cost-basis-delta meta line, two-cell aside). |

### Reused unchanged

- `src/lib/format/freshness.ts` — `formatFreshness` consumed by header
- `src/lib/format/date.ts` — `formatRelative` consumed transitively
- `src/lib/transactions/group-by-date.ts` — `groupTransactionsByDate` (from R.3.3) reused by `<InvestmentTxnsTable>` rewrite
- `src/lib/db/queries/health.ts` — `getSourceHealth` consumed by page
- All sync infrastructure: `syncItem`, `syncSnaptradeItem`, `syncExternalItem`, etc.
- All schema tables except the new `portfolio_snapshot` addition

---

## Data flow

Single page-level `Promise.all`:

```ts
const [summary, holdings, txns, history, sourceHealth] =
  await Promise.all([
    getPortfolioSummary(session.user.id),
    getHoldingsFlat(session.user.id),
    getRecentInvestmentTransactions(session.user.id, 20),
    getPortfolioHistory(session.user.id),
    getSourceHealth(session.user.id),
  ]);
```

Synchronous derivations in `page.tsx`:

```ts
const now = new Date();
const allocation = buildAllocation(holdings);
const accountsBreakdown = buildAccountsBreakdown(holdings);
const recentGroups = groupTransactionsByDate(txns);  // reuse R.3.3 helper
const investmentSources = sourceHealth.filter((s) =>
  s.byCapability.investments?.kind === 'tracked',
);
const freshness = formatFreshness({
  sources: investmentSources.map((s) => ({
    name: s.institutionName ?? 'Brokerage',
    lastSyncAt: s.byCapability.investments?.kind === 'tracked'
      ? s.byCapability.investments.lastSuccessAt
      : null,
  })),
  now,
});
```

**Note on freshness filter**: Investments-specific freshness uses the `byCapability.investments` slot from `getSourceHealth`, not the item-level `lastSuccessfulSyncAt`. A brokerage that's failing investments but succeeding transactions (e.g., SnapTrade Fidelity activities-410 case) should show as stale-for-investments on this page, even if /transactions reads it as fresh. This is a meaningful capability-aware freshness contract that the R.2 dashboard freshness (which uses item-level aggregate) doesn't expose.

### `getPortfolioHistory(userId)` shape

```ts
export type RangeKey = '1D' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type ChartPoint = {
  date: string;          // ISO YYYY-MM-DD
  value: number;
  estimated: boolean;    // true when from walkback, false when from snapshot
};

export type RangeData = {
  points: ChartPoint[];
  seamDate: string | null;   // earliest snapshot date in range, or null if all estimated
  startValue: number | null;
  endValue: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type PortfolioHistory = {
  byRange: Record<RangeKey, RangeData>;
  hasAnyData: boolean;
};
```

**Implementation**:
1. Read all `portfolio_snapshot` rows for `userId` within the longest range (5Y).
2. Read all `investment_transactions` for `userId` within the longest range, joined to `external_items` for user scoping. Filter to `type IN ('transfer', 'cash', 'fee')`.
3. Read today's `total_value` from `getPortfolioSummary(userId).totalValue`.
4. For each range: walk back from today through snapshots first (real values), fall through to walkback for pre-earliest-snapshot dates (estimated values).
5. For `1D`: special-case — use current `holdings` table `closePrice` vs `institutionPrice` aggregate to compute yesterday-close + today values.

**Note**: Query is bounded by 5Y horizon (max ~1825 rows snapshot + ~thousands txns for active users). For multi-user public release, may need pagination / per-range queries; for now single bounded read is acceptable.

### `recordPortfolioSnapshot(userId)` semantics

```ts
export async function recordPortfolioSnapshot(userId: string): Promise<void> {
  const summary = await getPortfolioSummary(userId);
  if (summary.accountCount === 0) return;  // no-op for users with no investment accounts

  const today = todayInUtc();  // YYYY-MM-DD
  await db
    .insert(portfolioSnapshot)
    .values({
      userId,
      snapshotDate: today,
      totalValue: String(summary.totalValue),
      totalCostBasis: String(summary.totalCost),
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshot.userId, portfolioSnapshot.snapshotDate],
      set: {
        totalValue: String(summary.totalValue),
        totalCostBasis: String(summary.totalCost),
      },
    });
}
```

Called from `src/lib/sync/dispatcher.ts` after a successful `syncItem(externalItemId)` that touched any investment-typed account. Wrapped in try/catch + `logError(userId, 'portfolio.snapshot', err)` so a snapshot failure doesn't fail the sync.

### Drilldown contract

R.3.4 has **no holdings drilldown**. Positions and Accounts are presentational. Position click does NOT open a detail sheet. (Future phase can add a Plaid-symbol info drawer if needed; not load-bearing for the long-horizon view.)

Recent activity rows are also presentational — they don't link to a filtered transactions view (investments txns aren't in the `/transactions` ledger; they live in `investment_transactions`).

### Mobile responsive

Single responsive layout — `<PortfolioHero>`, `<PerformanceChart>`, `<AllocationSection>`, `<HoldingsView>` all render fluidly via Tailwind responsive utilities. The recent-activity section keeps the existing CSS swap (`hidden md:block` for `<InvestmentTxnsTable>`, `md:hidden` for `<MobileList>` consumer) — minor reuse, not new infrastructure.

`<HoldingsView>` adapts internally: at md+ the position rows lay out as 3-line cards in a grid or table-like grid; at <md they stack as single-column rows. No separate `<MobileHoldings>` component. This drops the strike-2 risk surface of adding another `<MobileList>` consumer.

---

## Database schema addition

```ts
export const portfolioSnapshot = pgTable(
  'portfolio_snapshot',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalValue: numeric('total_value', { precision: 14, scale: 2 }).notNull(),
    totalCostBasis: numeric('total_cost_basis', { precision: 14, scale: 2 }).notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userDateUnique: uniqueIndex('portfolio_snapshot_user_date_idx').on(
      t.userId,
      t.snapshotDate,
    ),
  }),
);
```

**Migration story**:
1. Append the table definition to `src/lib/db/schema.ts` (coordinate with parallel agent's work).
2. Run `npm run db:push` to apply against Supabase Postgres.
3. RLS: per CLAUDE.md > "RLS on every `public.*` table — `db:push` won't add it", manually run `ALTER TABLE public.portfolio_snapshot ENABLE ROW LEVEL SECURITY;` against the DB before considering shipped. **PLAN T1 step explicitly includes this.**
4. No backfill required at migration time — `getPortfolioHistory` walkback handles all pre-snapshot dates. The table starts empty and grows daily as syncs run.

---

## Pure-helper specs

### `walkbackPortfolio(currentValue, txns, daysBack): ChartPoint[]`

**Signature**:
```ts
export type WalkbackTxn = {
  date: string;            // YYYY-MM-DD
  amount: number;          // Plaid sign: positive = cash OUT of broker
  type: string;            // 'transfer' | 'cash' | 'fee' | 'buy' | 'sell' | etc.
};

export function walkbackPortfolio(
  currentValue: number,
  txns: WalkbackTxn[],
  daysBack: number,
  today: Date,
): ChartPoint[];
```

**Walkback math**:
- Start with `runningValue = currentValue` at today.
- Filter txns to `type IN ('transfer', 'cash', 'fee')` ONLY — these represent external cash flow in/out of the broker. Buys/sells/dividends/cancels are internal asset-class changes at the broker (zero-sum for portfolio total).
- Walk one calendar day at a time from today backwards `daysBack` days.
- For each day, sum the day's filtered txn amounts and set `runningValue = runningValue + dayNetAmount` (positive amount means cash left the broker, so yesterday we had MORE before the outflow → add).
- Emit `{date: 'YYYY-MM-DD', value: runningValue, estimated: true}` for each day in range.
- Output sorted oldest first (ascending).

**Edge cases**:
- Empty txns → array of `daysBack + 1` points all equal to `currentValue` (flat line).
- daysBack = 0 → single point of `currentValue`.
- Negative `currentValue` → preserved; walkback math is sign-agnostic.

### `classifyHolding(securityType: string | null): AllocationClass`

**Mapping** (locked):

| Plaid `securities.type` value | AllocationClass |
|---|---|
| `'equity'`, `'stock'` | `'Equity'` |
| `'etf'` | `'ETF'` |
| `'mutual fund'`, `'mutual_fund'` | `'Mutual fund'` |
| `'fixed income'`, `'bond'`, `'bond_fund'` | `'Bond / fixed income'` |
| `'cash'`, `'money market'`, `'derivative'` | `'Cash'` |
| anything else, null, '' | `'Other'` |

Lookup function is pure + alphabetic-case-insensitive on the input. PLAN T2 step enumerates the literal switch/lookup. Real Plaid `security.type` values to audit during PLAN drafting via a one-time `SELECT DISTINCT type FROM securities;` against the dev DB.

### `buildAllocation(holdings: FlatHolding[]): AllocationSegment[]`

**Signature**:
```ts
export type AllocationSegment = {
  name: AllocationClass;
  value: number;       // sum of institutionValue for holdings classified into this class
  pct: number;         // value / totalValue * 100
};

export function buildAllocation(holdings: FlatHolding[]): AllocationSegment[];
```

- Sums `institutionValue` (defaulting null to 0) into buckets per `classifyHolding(securityType)`.
- Returns array sorted by `value` desc with `'Other'` pinned last regardless of its value rank (mirrors /recurring's "Other" sort).
- Zero-value buckets are filtered out (don't render empty segments).
- Total value 0 → empty array.

### `groupTransactionsByDate` (reuse from R.3.3)

No changes. The `<InvestmentTxnsTable>` rewrite imports `groupTransactionsByDate` from `src/lib/transactions/group-by-date.ts` and passes the result to a date-grouped renderer. Type signature works because `RecentInvestmentTxn` carries `date: string` like `Transaction`.

---

## UAT criteria

Walked top-to-bottom during T(N) polish reservation:

### Visual chrome
- [ ] Page header reads `Long horizon` (eyebrow) + `Investments` (h1) + page-sub copy + right-side freshness
- [ ] Page-sub reads "Where your money is working. Quiet by design — markets move, but the plan doesn't."
- [ ] Hero shows portfolio value as the largest object on the page; mono numerals
- [ ] Cost-basis delta line below value: `↑ $X.XX · +Y.YY% since cost basis` (or `↓` for loss)
- [ ] Hero aside: Cost basis cell + Holdings count cell with `· N accounts` sub
- [ ] No top-level day delta in the hero

### Performance chart
- [ ] 6 range tabs: `1D` / `1M` / `3M` / `6M` / `1Y` / `5Y`
- [ ] `1M` is the default selected tab
- [ ] Tab labels use mono font, active tab carries `--accent` color
- [ ] Chart shows dashed line for estimated portion (walkback) and solid line for snapshot portion
- [ ] Seam visible where the two lines connect; tooltip explains "Earlier values estimated from recorded transactions"
- [ ] Range subtitle shows period delta: `1M change · +$X.XX` (green positive / red negative)
- [ ] Min/max labels at chart corners (mono)
- [ ] Sparse-data state: when no data exists for selected range, render empty-state copy "Trajectory builds with daily snapshots — N/30 days collected" with tabs visible but inert

### Allocation
- [ ] Horizontal stacked bar renders all non-zero classes proportionally
- [ ] Legend list below bar: dot + name + pct (mono) + value (mono), sorted by value desc
- [ ] `'Other'` class pinned last regardless of rank
- [ ] Bar segments use distinct restrained hues per class (NOT one hue per holding — "Christmas tree" antipattern guard)
- [ ] Hover tooltip on bar segment shows class name + pct

### Holdings view
- [ ] Two tabs: `Positions` / `Accounts`
- [ ] Positions default selected
- [ ] Positions tab: rows show ticker (mono) + name + meta (type · account) on left; quantity + price + value + per-position day delta + gain/loss on right
- [ ] Positions sorted by `institutionValue` desc, no group-by toggle
- [ ] No sortable column headers — header row is presentational
- [ ] Accounts tab: card per account with account name + account total + nested position list
- [ ] Account cards sorted by aggregate value desc

### Recent activity
- [ ] Section eyebrow: "Recent activity · N" (was "Recent investment activity")
- [ ] Rows date-grouped via R.3.3's `groupTransactionsByDate` reused
- [ ] Day-net header at top of each group: `MAY 9 · FRI` left, `↑ $50.00` or `↓ -$2,500.00` right
- [ ] Row layout: type pill + security + quantity (mono) + amount (mono)
- [ ] Type pill uses muted token (single tone per `<InvestmentTxnsTable>` restrained-floor rule)

### Freshness strip
- [ ] Right-side of `<InvestmentsPageHeader>` reads `Fresh Nh ago · N sources` (or `Last sync Nh ago` / `Syncing` per `formatFreshness` rules)
- [ ] Caveat line renders below headline when present
- [ ] Capability-aware: a brokerage failing investments shows as stale here, even if it's fresh on /dashboard or /transactions

### Snapshot infrastructure (T1 verification)
- [ ] `portfolio_snapshot` table exists with correct columns + unique index
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` confirmed via `\d+ portfolio_snapshot` in psql
- [ ] After manual sync via `/settings`, a new row appears in `portfolio_snapshot` for today's date with non-zero `total_value`
- [ ] Second sync same day upserts (doesn't duplicate); `total_value` reflects the latest sync
- [ ] User with no investment accounts → no `portfolio_snapshot` row written (no-op)
- [ ] SnapTrade item with Fidelity 410 activities → snapshot still writes (positions sync succeeds independently)

### Walkback honesty
- [ ] Chart's earliest dashed-line value (5Y back) is mathematically traceable from the user's `currentValue` + the sum of filtered `investment_transactions` over the window
- [ ] Buys/sells/dividends/fees/cancels don't affect the walkback (zero-sum at portfolio level)
- [ ] Transfers/cash/fees DO affect the walkback per the policy

### Empty + sparse states
- [ ] No accounts connected → `<EmptyState>` renders with brokerage-connect CTA
- [ ] Accounts connected, no holdings reported → page renders but holdings/allocation sections show empty-state copy
- [ ] Snapshots empty AND walkback empty → chart shows "Trajectory builds with daily snapshots" copy

### Theme parity
- [ ] Dark mode walk: hero / chart / allocation / holdings / activity all readable
- [ ] Light mode walk: same
- [ ] Chart dashed line is distinguishable from solid line in both themes

### Build + tests
- [ ] `npm run typecheck` clean
- [ ] `npm run test` passes (~+18-21 net cases)
- [ ] `npm run build` clean (27/27 pages — no route delta from R.3.4)
- [ ] No NEW server→client function props (RSC boundary strike-3 guard — verified via grep for new `'use client'` directives carrying object props)

### RSC boundary strike-3 watch
- [ ] `<PerformanceChart>` props are plain-data only (verified via TypeScript inspection of the consumer call site)
- [ ] `<HoldingsView>` props are plain-data only
- [ ] No new `MobileList` consumer added to /investments mobile path (drops the existing one in favor of responsive `<HoldingsView>`)

### Reactivity
- [ ] After /settings manual sync, /investments refresh shows updated total_value (verify via `revalidatePath('/investments')` in `syncItemAction` / `syncAllItemsAction`)
- [ ] Range tab clicks don't trigger network requests (all data pre-loaded into `byRange`)

---

## Out of scope (explicit non-goals for R.3.4)

- **Per-holding history chart** — only portfolio-level trajectory is in scope
- **Intraday data** — no minute/hour granularity; daily snapshots only (1D special-case uses 2 points)
- **Asset class beyond `security.type`** — no US-vs-International, no sector breakdown; that would require security metadata we don't store
- **Cost-basis time series chart** — captured in snapshot rows for future use but not surfaced as a separate chart
- **Performance attribution** ("VTI gained 5%, dragged by VXUS") — analytical depth out of scope
- **Tax-lot tracking** — Plaid doesn't expose per-lot data; out of scope
- **What-if simulator** — Phase 4-pt2, independently deferred
- **Rebalancing recommendations** — long-horizon voice argues against it
- **Position drilldown sheet** — presentational rows only; future phase
- **Other R.3 routes** (Simulator, Settings) → R.3.5 / R.3.6
- **Mobile rebuild** → R.5

---

## Dependencies

### Upstream

- R.2 Dashboard shipped on `feat/redesign` — `formatFreshness`, page-header pattern, freshness strip
- R.3.1 Goals shipped — page-header `eyebrow + h1 + freshness aside` pattern
- R.3.2 Recurring shipped — `<RecurringPageHeader>` + capability-aware section sort precedent
- R.3.3 Transactions shipped — `groupTransactionsByDate` pure helper reused for `<InvestmentTxnsTable>` date grouping
- Reliability Phase 3 — `getSourceHealth(userId)` query with capability breakdown (`byCapability.investments`)
- Existing sync infrastructure — `syncItem`, `syncSnaptradeItem`, `syncExternalItem` (dispatcher)
- Existing `getPortfolioSummary` query — basis for the new hero rendering

### Concurrent (uncommitted at SPEC write time)

- **Parallel agent**: code-quality refactor across `src/lib/db/queries/*.ts`, `src/lib/db/schema.ts`, `src/lib/format/date.ts`, `src/lib/goals/actions.ts`, `src/lib/recurring/calendar-windows.ts`, plus a new `src/lib/db/source-scope.ts` helper and `docs/migrations/2026-05-11-quality-indexes.sql`.
- **Coordination strategy**: Before T1's schema-append step, verify `git status` is clean OR commit the schema append after their work lands. The new `portfolio_snapshot` table can be appended at the bottom of `schema.ts` to minimize conflict surface. Their `quality-indexes.sql` migration is independent.
- **`getPortfolioHistory` query**: Will follow whatever query-shape conventions the parallel agent's refactor establishes (e.g., if they introduce `sourceScopeWhere(userId)`, R.3.4 query SHOULD adopt the same helper for consistency).

### Downstream

- R.3.5 Simulator continues to consume the forecast layer; no impact
- R.3.6 Settings — no impact
- R.4 Goals Moves + scenario unification — no impact
- Future phase: per-holding history chart could be added by extending the snapshot table to per-holding rows or adding a sibling `holding_snapshot` table

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Schema-append conflicts with parallel agent's uncommitted schema.ts changes** | **High** | T1 step explicitly: `git status` first; coordinate via append-at-bottom strategy; if conflicts, rebase against their committed work after they land. PLAN documents the rollback path. |
| **Walkback math is wrong for some Plaid investment_transaction `type` values** | **High** | Filter is restrictive (`'transfer' | 'cash' | 'fee'` only). Pure helper is testable; PLAN T3 enumerates ~10 edge cases. Audit `SELECT DISTINCT type FROM investment_transactions` against dev DB during PLAN drafting to confirm the filter set is correct against real data. |
| **Recharts dual-line seam looks broken (visible gap, mismatched scale)** | Medium | T7 step explicitly validates: the last estimated point and first real point share the same `date` AND `value` so the two lines visually connect. Test with a known dataset where the seam date is mid-range. |
| **Snapshot write inside sync dispatcher fails silently** | Medium | `try/catch + logError(userId, 'portfolio.snapshot', err)` so failures surface in the daily digest. Test the failure path by injecting a write error during T1 verification. |
| **`portfolio_snapshot` RLS missed (forgot the manual `ALTER TABLE`)** | Medium | PLAN T1 includes the explicit ALTER step + verification via psql `\d+ portfolio_snapshot`. CLAUDE.md > "RLS on every `public.*` table" pattern caught this once before. |
| **Allocation classifier misclassifies a real `securities.type` value** | Medium | T2 step queries `SELECT DISTINCT type FROM securities` against dev DB before locking the lookup table. Unknown values fall through to `'Other'` — safe default. |
| **`<PerformanceChart>` re-renders kill perf on every range click** | Low | Range tabs are local React state in a client component; data is pre-loaded into `byRange`. No network on tab click. Recharts re-render is cheap for ~365 points. |
| **1D tab renders garbage when no holdings have closePrice** | Low | T4 step: when `byRange['1D'].points.length < 2`, render `disabled` attribute on the tab. Pure helper output makes this trivial to detect. |
| **Strike-3 RSC boundary** | Low | Two new client components — both take serializable props only (no functions). T6 + T7 commit-message checklist verifies. PLAN reminder at PLAN top per R.3.2/R.3.3 precedent. |
| **Holdings view drops operator-tier features without communication** | Medium | This is an explicit user choice locked in scope decision #2. UAT criterion explicitly lists "no sortable column headers — header row is presentational" so it's confirmed during walk. **No remediation if the user later wants to back off; would require a new SPEC pass.** |
| **`getPortfolioHistory` is slow on multi-year-deep accounts** | Low | Query bounded by 5Y horizon. Single SELECT per range type (snapshots + txns), one walkback pass per range. For multi-user public release, may need range-specific queries; not load-bearing for current single-user state. |

---

## Locked decisions (carried)

1. **Performance chart**: Add `portfolio_snapshot` + walkback (per Round 1)
2. **Scope**: Wholesale prototype IA (per Round 1) — DROPS group-by toggle + sortable columns
3. **Allocation classifier**: Group by `securities.type` (per Round 1)
4. **Recent activity**: Keep as separate section below Holdings (per Round 1)
5. **Snapshot backfill**: Walkback + flag as estimated (per Round 2)
6. **Page eyebrow**: "Long horizon" per prototype (per Round 2)
7. **Day delta**: 4th range tab `1D` (per Round 2)

Auto-locked during design (revisitable via `fix(r3.4):`):

- Snapshot trigger via sync dispatcher (not new cron route)
- Walkback type filter: `'transfer' | 'cash' | 'fee'` only
- Snapshot shape: portfolio-totals only (not per-holding)
- Default range tab: `1M`
- Recharts dual-`<Line>` for estimated/real
- Holdings drilldown: NONE in R.3.4 (presentational only)
- Mobile: single responsive component (drops the `<MobileInvestments>` holdings consumer)

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/investments/walkback.ts` | Unit (vitest) | ~10 |
| `src/lib/investments/allocation.ts` | Unit (vitest) | ~8 |
| `src/lib/investments/snapshots.ts` | UAT-validated (no separate test) | 0 |
| `src/lib/db/queries/portfolio-history.ts` | UAT-validated (no separate test) | 0 |
| Component files | UAT only | 0 |

**Net**: +18 cases. Target post-R.3.4: 578 → ~596.

---

## Cross-references

- [docs/redesign/r3-4-investments/PLAN.md](PLAN.md) — implementation plan (written next via writing-plans skill)
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) — page-header pattern precedent
- [docs/redesign/r3-2-recurring/SPEC.md](../r3-2-recurring/SPEC.md) — section-eyebrow + capability-aware sort precedent
- [docs/redesign/r3-3-transactions/SPEC.md](../r3-3-transactions/SPEC.md) — `groupTransactionsByDate` source + freshness pattern
- [docs/redesign/r3-3-transactions/PLAN.md](../r3-3-transactions/PLAN.md) — atomic-commit task sequence template
- [claude-design-context/foothold-investments.jsx](../../../claude-design-context/foothold-investments.jsx) — prototype reference
- [docs/redesign/HANDOFF-2026-05-11.md](../HANDOFF-2026-05-11.md) — session pickup context
- [CLAUDE.md](../../../CLAUDE.md) — project orientation (especially Architecture > Editorial tokens, Architecture > RLS on every public.* table, Lessons learned > server→client function props, Architecture > Phase 6.7 operator-tier features that R.3.4 INTENTIONALLY DROPS)
