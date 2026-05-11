# R.3.4 Investments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wholesale-IA redesign of `/investments` per the Foothold Design bundle, plus new daily snapshot infrastructure (table + walkback + dual-line chart) so the prototype's range-tab performance chart has meaningful data from day one.

**Architecture:** Add a `portfolio_snapshot` table; piggyback writes on the existing sync dispatcher's success path so no new cron route is needed. Walkback through `investment_transactions` (filtered to `type IN ('transfer', 'cash', 'fee')`) to fabricate pre-snapshot history with an estimated-vs-real visual seam. Replace the existing operator-tier holdings table (sortable columns + group-by toggle) with prototype's Positions/Accounts client-side tab switcher. New components are server-rendered by default; two client islands (`<PerformanceChart>`, `<HoldingsView>`) take plain-data-only props to keep the strike-3 RSC boundary safe.

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Supabase Postgres · Recharts (dual `<Line>` for dashed/solid seam) · Vitest · Tailwind (Foothold tokens) · existing `formatFreshness` + `groupTransactionsByDate` (reused from R.3.3).

---

## Pre-flight (run BEFORE T1)

These are not implementation steps but mandatory environmental checks:

```bash
# 1. Confirm baseline state
git status                          # MUST be clean (parallel agent's work landed) before T1's schema-append step. If still dirty, see "Coordination" below.
git branch --show-current           # MUST be feat/redesign
git log --oneline feat/redesign -3  # MUST show cb71ea1 Merge branch 'feat/r3-3-transactions' is recent

# 2. Confirm tests + typecheck baseline
npm run typecheck                   # MUST be clean
npm run test 2>&1 | tail -3         # MUST be 578 passed (or higher post-parallel-agent merge)

# 3. Cut R.3.4 branch from feat/redesign
git checkout feat/redesign
git checkout -b feat/r3-4-investments
```

**Coordination with parallel agent:**

If `git status` shows uncommitted work in `src/lib/db/queries/*.ts`, `src/lib/db/schema.ts`, `src/lib/format/date.ts`, or new `src/lib/db/source-scope.ts`: that's the parallel agent's code-quality refactor. Two options:

- **Wait** for them to commit before starting T1 (recommended — minimal merge surface).
- **Coordinate the schema append at the BOTTOM of `src/lib/db/schema.ts`** so your diff doesn't overlap their middle-of-file additions. If conflict still happens at merge time, rebase your T1 commit against their committed version.

**Commit ordering note:** Each task below produces one atomic commit. Each commit message uses the `feat(r3.4):` or `chore(r3.4):` or `test(r3.4):` prefix per convention.

---

## File Structure

### New files (10)

| Path | Type | Responsibility |
|---|---|---|
| `src/lib/db/schema.ts` (append) | schema | New `portfolioSnapshots` table definition |
| `src/lib/investments/walkback.ts` | pure | `walkbackPortfolio()` — anchor on today, walk back through filtered txns |
| `src/lib/investments/walkback.test.ts` | unit | ~12 vitest cases |
| `src/lib/investments/allocation.ts` | pure | `classifyHolding()` + `buildAllocation()` |
| `src/lib/investments/allocation.test.ts` | unit | ~16 vitest cases |
| `src/lib/investments/snapshots.ts` | db side-effect | `recordPortfolioSnapshot(userId)` |
| `src/lib/db/queries/portfolio-history.ts` | query | `getPortfolioHistory(userId)` merging snapshots + walkback |
| `src/components/investments/investments-page-header.tsx` | server | Eyebrow + h1 + page sub + freshness |
| `src/components/investments/portfolio-hero.tsx` | server | Big portfolio value + cost-basis delta + aside cells |
| `src/components/investments/performance-chart.tsx` | **client** | Range tabs + Recharts dual-`<Line>` |
| `src/components/investments/allocation-section.tsx` | server | Bar + legend |
| `src/components/investments/holdings-view.tsx` | **client** | Positions/Accounts tab toggle + renderings |

### Modified files (5)

| Path | Change |
|---|---|
| `src/app/(app)/investments/page.tsx` | Wholesale rewrite |
| `src/components/investments/investment-txns-table.tsx` | Token swap + date grouping + eyebrow rename |
| `src/components/investments/mobile-investments.tsx` | Token swap; drop holdings `<MobileList>` (responsive `<HoldingsView>` absorbs); keep recent-activity `<MobileList>` |
| `src/lib/sync/dispatcher.ts` | Inject post-success `recordPortfolioSnapshot()` call |
| `src/lib/plaid/actions.ts` | Add `revalidatePath('/investments')` to sync actions if missing (audit) |

### Deleted files (3)

- `src/components/investments/group-by-toggle.tsx` — wholesale IA drops the toggle
- `src/components/investments/holdings-table.tsx` — replaced by `<HoldingsView>` Positions render
- `src/components/investments/portfolio-summary.tsx` — replaced by `<PortfolioHero>`

---

## Task sequence (14 atomic commits)

- **T1**: Schema — add `portfolio_snapshot` table
- **T2**: Pure helper — `walkbackPortfolio`
- **T3**: Pure helpers — `classifyHolding` + `buildAllocation`
- **T4**: Query — `getPortfolioHistory`
- **T5**: Side-effect — `recordPortfolioSnapshot` + dispatcher integration
- **T6**: Server component — `<InvestmentsPageHeader>`
- **T7**: Server component — `<PortfolioHero>`
- **T8**: Client component — `<PerformanceChart>`
- **T9**: Server component — `<AllocationSection>`
- **T10**: Client component — `<HoldingsView>`
- **T11**: Restyle — `<InvestmentTxnsTable>` with date grouping
- **T12**: Restyle — `<MobileInvestments>` (recent-activity only)
- **T13**: Page rewrite + obsolete-file deletion + revalidatePath wiring
- **T14**: UAT polish reservation

---

## Task 1: Schema — add `portfolio_snapshot` table

**Files:**
- Modify: `src/lib/db/schema.ts` (append at bottom, before the closing of the file)

- [ ] **Step 1: Add the table definition**

Append this block to `src/lib/db/schema.ts` immediately AFTER the `snaptradeUsers` table definition (around line 707) or at the very bottom if a parallel agent has added other tables since:

```ts
/**
 * Daily snapshot of each user's portfolio totals. R.3.4 redesign
 * support — drives the /investments page's range-tab performance
 * chart. Two consumers planned:
 *
 *   - **Performance chart** — chart's solid (real) line reads from
 *     this table; the dashed (estimated) line is walked back through
 *     `investment_transactions` for dates earlier than the user's
 *     first snapshot.
 *   - **Future cost-basis trajectory** — `totalCostBasis` captured
 *     here too so future analyses don't require a migration.
 *
 * Snapshot writes piggyback on `syncExternalItem` (sync dispatcher)
 * — no separate cron route. Multiple syncs per day collapse to one
 * row via ON CONFLICT (user_id, snapshot_date) DO UPDATE.
 *
 * `snapshotDate` is a calendar `date` derived in UTC at sync time.
 * Mirrors the forecast_snapshot pattern from Phase 1 simulator
 * reorientation.
 */
export const portfolioSnapshots = pgTable(
  'portfolio_snapshot',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    totalValue: numeric('total_value', { precision: 14, scale: 2 }).notNull(),
    totalCostBasis: numeric('total_cost_basis', {
      precision: 14,
      scale: 2,
    }).notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userDateUnique: uniqueIndex('portfolio_snapshot_user_date_idx').on(
      t.userId,
      t.snapshotDate,
    ),
  }),
);

export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
export type PortfolioSnapshotInsert = typeof portfolioSnapshots.$inferInsert;
```

- [ ] **Step 2: Push schema to Supabase**

Run:

```bash
npm run db:push
```

Expected: Drizzle Kit prompt about creating the new table; confirm. Output mentions `CREATE TABLE "portfolio_snapshot"` and `CREATE UNIQUE INDEX "portfolio_snapshot_user_date_idx"`.

If you hit the "stdin / strict:true" hang per CLAUDE.md > Lessons learned, temporarily flip `strict: false` in `drizzle.config.ts`, push, then flip back.

- [ ] **Step 3: Enable RLS manually**

Per CLAUDE.md > "RLS on every `public.*` table — `db:push` won't add it":

```bash
# Connect to Supabase Postgres directly. Pull connection string from .env:
psql "$DIRECT_DATABASE_URL" -c "ALTER TABLE public.portfolio_snapshot ENABLE ROW LEVEL SECURITY;"
```

Expected: `ALTER TABLE` confirmation.

- [ ] **Step 4: Verify table + RLS**

```bash
psql "$DIRECT_DATABASE_URL" -c "\d+ public.portfolio_snapshot"
```

Expected: shows the 5 columns (`id`, `user_id`, `snapshot_date`, `total_value`, `total_cost_basis`, `created_at`), the unique index, and `Row security enabled: yes` in the footer.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(r3.4): T1 portfolio_snapshot table + RLS"
```

---

## Task 2: Pure helper — `walkbackPortfolio`

**Files:**
- Create: `src/lib/investments/walkback.ts`
- Create: `src/lib/investments/walkback.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/investments/walkback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { walkbackPortfolio } from './walkback';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('walkbackPortfolio', () => {
  it('returns daysBack + 1 points anchored to currentValue when no txns', () => {
    const out = walkbackPortfolio(1000, [], 3, day('2026-05-11'));
    expect(out).toHaveLength(4);
    expect(out.every((p) => p.value === 1000)).toBe(true);
    expect(out.every((p) => p.estimated === true)).toBe(true);
  });

  it('orders points oldest-first ascending', () => {
    const out = walkbackPortfolio(1000, [], 2, day('2026-05-11'));
    expect(out.map((p) => p.date)).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
    ]);
  });

  it('daysBack=0 yields a single point at today', () => {
    const out = walkbackPortfolio(500, [], 0, day('2026-05-11'));
    expect(out).toEqual([
      { date: '2026-05-11', value: 500, estimated: true },
    ]);
  });

  it('cash-in deposit today (amount=-100): yesterday had 100 less', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -100, type: 'cash' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(900);
    expect(out.find((p) => p.date === '2026-05-11')?.value).toBe(1000);
  });

  it('cash-out withdrawal today (amount=+100): yesterday had 100 more', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 100, type: 'cash' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(1100);
    expect(out.find((p) => p.date === '2026-05-11')?.value).toBe(1000);
  });

  it('fee today (amount=+10): yesterday had 10 more', () => {
    const out = walkbackPortfolio(
      990,
      [{ date: '2026-05-11', amount: 10, type: 'fee' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(1000);
  });

  it('buy txn (type=buy) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 500, type: 'buy' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('sell txn (type=sell) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -200, type: 'sell' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('dividend txn (type=dividend) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -50, type: 'dividend' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('cancel txn (type=cancel) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 100, type: 'cancel' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('sums multiple txns on the same day', () => {
    const out = walkbackPortfolio(
      1000,
      [
        { date: '2026-05-11', amount: 50, type: 'fee' },
        { date: '2026-05-11', amount: -200, type: 'cash' },
        { date: '2026-05-11', amount: 99, type: 'buy' }, // filtered
      ],
      1,
      day('2026-05-11'),
    );
    // Net amount filtered: 50 + -200 = -150
    // yesterday = today + (-150) = 1000 - 150 = 850
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(850);
  });

  it('flat segments where no txns occur on a day', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-10', amount: -100, type: 'cash' }],
      2,
      day('2026-05-11'),
    );
    expect(out.map((p) => p.value)).toEqual([900, 900, 1000]);
  });

  it('all points flagged as estimated', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -100, type: 'cash' }],
      2,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.estimated === true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- --run src/lib/investments/walkback.test.ts
```

Expected: FAIL with import resolution error (`walkback` module not found).

- [ ] **Step 3: Implement the helper**

Create `src/lib/investments/walkback.ts`:

```ts
export type WalkbackTxn = {
  date: string; // YYYY-MM-DD
  amount: number; // Plaid sign: positive = cash OUT of broker
  type: string; // 'transfer' | 'cash' | 'fee' | 'buy' | etc.
};

export type WalkbackPoint = {
  date: string; // YYYY-MM-DD
  value: number;
  estimated: true;
};

/**
 * Types that represent EXTERNAL cash flow into/out of the broker.
 * Buys/sells/dividends/cancels are internal asset class changes at the
 * broker level (e.g., $1000 of broker cash → $1000 of security) and
 * are zero-sum at the portfolio-total level — they don't affect the
 * walkback. Per [src/components/investments/investment-txns-table.tsx]
 * comment: Plaid's investment_transaction.amount is cash-sweep-oriented
 * (positive = cash left the broker), not portfolio-oriented.
 */
const ALLOWED_TYPES = new Set(['transfer', 'cash', 'fee']);

function toIsoDate(d: Date): string {
  // Use UTC to avoid timezone drift; matches existing date math in
  // src/lib/transactions/group-by-date.ts.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Walk back portfolio totals from `currentValue` at `today` through
 * `daysBack` calendar days. Each day's net signed amount of allowed-
 * type txns is added to the running value (positive amount = cash
 * left broker → yesterday had MORE before the outflow). All points
 * carry `estimated: true` so callers can distinguish from real
 * snapshot values.
 *
 * Output is sorted oldest-first ascending; includes both endpoints
 * (today + (today - daysBack days)) inclusive.
 */
export function walkbackPortfolio(
  currentValue: number,
  txns: WalkbackTxn[],
  daysBack: number,
  today: Date,
): WalkbackPoint[] {
  // Bucket allowed-type txns by date for O(1) day lookup.
  const dailyNet = new Map<string, number>();
  for (const t of txns) {
    if (!ALLOWED_TYPES.has(t.type)) continue;
    dailyNet.set(t.date, (dailyNet.get(t.date) ?? 0) + t.amount);
  }

  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  const points: WalkbackPoint[] = [];
  let running = currentValue;
  for (let i = 0; i <= daysBack; i++) {
    const dayMs = todayMs - i * 86_400_000;
    const dayIso = toIsoDate(new Date(dayMs));
    points.push({ date: dayIso, value: running, estimated: true });
    // Step back one more day: yesterday = today + (today's net amount)
    running += dailyNet.get(dayIso) ?? 0;
  }
  return points.reverse();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- --run src/lib/investments/walkback.test.ts
```

Expected: PASS (13 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/investments/walkback.ts src/lib/investments/walkback.test.ts
git commit -m "feat(r3.4): T2 walkbackPortfolio pure helper"
```

---

## Task 3: Pure helpers — `classifyHolding` + `buildAllocation`

**Files:**
- Create: `src/lib/investments/allocation.ts`
- Create: `src/lib/investments/allocation.test.ts`

- [ ] **Step 1: Audit real `securities.type` values against dev DB**

Before writing the lookup, check what values actually exist:

```bash
psql "$DIRECT_DATABASE_URL" -c "SELECT DISTINCT type, COUNT(*) FROM securities GROUP BY type ORDER BY 2 DESC;"
```

If the real values include anything not in the SPEC's mapping (e.g., `'crypto'`, `'option'`, `'commodity'`), add a row for that value to the `Other` fallthrough path in the implementation step. If the real values are a clean subset of `['etf', 'equity', 'mutual fund', 'fixed income', 'cash']`, proceed as-is.

Record the observed values in a comment in `allocation.ts` so future engineers don't re-run this audit.

- [ ] **Step 2: Write the failing tests first**

Create `src/lib/investments/allocation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAllocation, classifyHolding } from './allocation';

describe('classifyHolding', () => {
  it('etf maps to ETF', () => {
    expect(classifyHolding('etf')).toBe('ETF');
  });

  it('equity maps to Equity', () => {
    expect(classifyHolding('equity')).toBe('Equity');
  });

  it('stock maps to Equity', () => {
    expect(classifyHolding('stock')).toBe('Equity');
  });

  it('mutual fund maps to Mutual fund', () => {
    expect(classifyHolding('mutual fund')).toBe('Mutual fund');
  });

  it('mutual_fund maps to Mutual fund', () => {
    expect(classifyHolding('mutual_fund')).toBe('Mutual fund');
  });

  it('fixed income maps to Bond / fixed income', () => {
    expect(classifyHolding('fixed income')).toBe('Bond / fixed income');
  });

  it('bond maps to Bond / fixed income', () => {
    expect(classifyHolding('bond')).toBe('Bond / fixed income');
  });

  it('cash maps to Cash', () => {
    expect(classifyHolding('cash')).toBe('Cash');
  });

  it('null maps to Other', () => {
    expect(classifyHolding(null)).toBe('Other');
  });

  it('empty string maps to Other', () => {
    expect(classifyHolding('')).toBe('Other');
  });

  it('unknown type maps to Other', () => {
    expect(classifyHolding('crypto')).toBe('Other');
  });

  it('is case-insensitive: EQUITY maps to Equity', () => {
    expect(classifyHolding('EQUITY')).toBe('Equity');
  });
});

describe('buildAllocation', () => {
  it('returns empty array on empty holdings', () => {
    expect(buildAllocation([])).toEqual([]);
  });

  it('single ETF holding becomes a single 100% segment', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 1000 },
    ]);
    expect(out).toEqual([{ name: 'ETF', value: 1000, pct: 100 }]);
  });

  it('two classes sorted by value desc', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 300 },
      { securityType: 'cash', institutionValue: 700 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['Cash', 'ETF']);
  });

  it('Other pinned last regardless of rank', () => {
    const out = buildAllocation([
      { securityType: 'crypto', institutionValue: 9000 }, // Other, dominant
      { securityType: 'etf', institutionValue: 100 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['ETF', 'Other']);
  });

  it('null institutionValue treated as 0', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: null },
      { securityType: 'cash', institutionValue: 500 },
    ]);
    expect(out).toEqual([{ name: 'Cash', value: 500, pct: 100 }]);
  });

  it('filters out zero-value buckets', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 0 },
      { securityType: 'cash', institutionValue: 500 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['Cash']);
  });

  it('pct math sums to ~100', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 300 },
      { securityType: 'cash', institutionValue: 700 },
    ]);
    const total = out.reduce((s, x) => s + x.pct, 0);
    expect(total).toBeCloseTo(100, 4);
  });

  it('sums multiple holdings into same class', () => {
    const out = buildAllocation([
      { securityType: 'equity', institutionValue: 100 },
      { securityType: 'stock', institutionValue: 200 },
      { securityType: 'etf', institutionValue: 500 },
    ]);
    const equity = out.find((s) => s.name === 'Equity');
    expect(equity?.value).toBe(300);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test -- --run src/lib/investments/allocation.test.ts
```

Expected: FAIL with import resolution error.

- [ ] **Step 4: Implement the helpers**

Create `src/lib/investments/allocation.ts`:

```ts
export type AllocationClass =
  | 'Equity'
  | 'ETF'
  | 'Mutual fund'
  | 'Bond / fixed income'
  | 'Cash'
  | 'Other';

export type AllocationSegment = {
  name: AllocationClass;
  value: number;
  pct: number;
};

// Observed distinct `securities.type` values in dev DB at time of
// write (from T3 step 1 audit): etf, equity, mutual fund, fixed
// income, cash. Anything else falls through to Other.
const TYPE_LOOKUP: Record<string, AllocationClass> = {
  etf: 'ETF',
  equity: 'Equity',
  stock: 'Equity',
  'mutual fund': 'Mutual fund',
  mutual_fund: 'Mutual fund',
  'fixed income': 'Bond / fixed income',
  fixed_income: 'Bond / fixed income',
  bond: 'Bond / fixed income',
  bond_fund: 'Bond / fixed income',
  cash: 'Cash',
  'money market': 'Cash',
};

export function classifyHolding(securityType: string | null): AllocationClass {
  if (!securityType) return 'Other';
  const key = securityType.toLowerCase().trim();
  return TYPE_LOOKUP[key] ?? 'Other';
}

type InputHolding = {
  securityType: string | null;
  institutionValue: number | null;
};

/**
 * Build allocation segments from holdings. Sorted by value desc with
 * 'Other' pinned last regardless of rank. Zero-value classes filtered
 * out. Mirrors /recurring's "Other category pinned last" pattern.
 */
export function buildAllocation(holdings: InputHolding[]): AllocationSegment[] {
  if (holdings.length === 0) return [];

  const buckets = new Map<AllocationClass, number>();
  let total = 0;
  for (const h of holdings) {
    const value = h.institutionValue ?? 0;
    if (value <= 0) continue;
    const cls = classifyHolding(h.securityType);
    buckets.set(cls, (buckets.get(cls) ?? 0) + value);
    total += value;
  }
  if (total === 0) return [];

  const segments: AllocationSegment[] = Array.from(buckets.entries()).map(
    ([name, value]) => ({ name, value, pct: (value / total) * 100 }),
  );

  // Sort value desc, then pin 'Other' last.
  segments.sort((a, b) => {
    if (a.name === 'Other' && b.name !== 'Other') return 1;
    if (b.name === 'Other' && a.name !== 'Other') return -1;
    return b.value - a.value;
  });

  return segments;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test -- --run src/lib/investments/allocation.test.ts
```

Expected: PASS (19 tests).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/investments/allocation.ts src/lib/investments/allocation.test.ts
git commit -m "feat(r3.4): T3 classifyHolding + buildAllocation pure helpers"
```

---

## Task 4: Query — `getPortfolioHistory`

**Files:**
- Create: `src/lib/db/queries/portfolio-history.ts`

This task is UAT-validated (no separate test file) per SPEC test plan summary. The query is integration-tested via T13's page UAT walk.

- [ ] **Step 1: Implement the query**

Create `src/lib/db/queries/portfolio-history.ts`:

```ts
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  externalItems,
  financialAccounts,
  holdings,
  investmentTransactions,
  portfolioSnapshots,
  securities,
} from '@/lib/db/schema';
import {
  walkbackPortfolio,
  type WalkbackPoint,
  type WalkbackTxn,
} from '@/lib/investments/walkback';

export type RangeKey = '1D' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export type ChartPoint = {
  date: string;
  value: number;
  estimated: boolean;
};

export type RangeData = {
  points: ChartPoint[];
  seamDate: string | null;
  startValue: number | null;
  endValue: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type PortfolioHistory = {
  byRange: Record<RangeKey, RangeData>;
  hasAnyData: boolean;
};

const DAYS_BACK_BY_RANGE: Record<RangeKey, number> = {
  '1D': 1,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '5Y': 1825,
};

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Portfolio trajectory across 6 ranges. Merges real snapshot rows
 * (solid line in the chart) with walkback estimates (dashed line)
 * for dates earlier than the user's first snapshot. The seam date
 * is the earliest snapshot date in the range.
 *
 * 1D is special-cased: only 2 points — yesterday's close (computed
 * from securities.closePrice × current holdings.quantity) and today
 * (current institutionValue). The 1D range doesn't use the walkback
 * path; it reads directly from the holdings + securities join.
 */
export async function getPortfolioHistory(
  userId: string,
): Promise<PortfolioHistory> {
  const today = startOfUtcDay(new Date());
  const horizonStart = new Date(
    today.getTime() - DAYS_BACK_BY_RANGE['5Y'] * 86_400_000,
  );

  // Three parallel reads:
  // (1) all snapshots within the 5Y horizon
  // (2) all investment txns within the 5Y horizon (for walkback)
  // (3) current holdings + closePrice (for today's value + 1D special-case)
  const [snapshotRows, txnRows, holdingRows] = await Promise.all([
    db
      .select({
        snapshotDate: portfolioSnapshots.snapshotDate,
        totalValue: portfolioSnapshots.totalValue,
      })
      .from(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          gte(portfolioSnapshots.snapshotDate, toIsoDate(horizonStart)),
        ),
      )
      .orderBy(desc(portfolioSnapshots.snapshotDate)),
    db
      .select({
        date: investmentTransactions.date,
        amount: investmentTransactions.amount,
        type: investmentTransactions.type,
      })
      .from(investmentTransactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, investmentTransactions.accountId),
      )
      .innerJoin(
        externalItems,
        eq(externalItems.id, financialAccounts.itemId),
      )
      .where(
        and(
          eq(externalItems.userId, userId),
          gte(investmentTransactions.date, toIsoDate(horizonStart)),
        ),
      ),
    db
      .select({
        quantity: holdings.quantity,
        institutionPrice: holdings.institutionPrice,
        institutionValue: holdings.institutionValue,
        closePrice: securities.closePrice,
      })
      .from(holdings)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, holdings.accountId),
      )
      .innerJoin(
        externalItems,
        eq(externalItems.id, financialAccounts.itemId),
      )
      .innerJoin(securities, eq(securities.id, holdings.securityId))
      .where(
        and(
          eq(externalItems.userId, userId),
          eq(financialAccounts.type, 'investment'),
        ),
      ),
  ]);

  // Today's total value (anchor for walkback).
  let currentValue = 0;
  let yesterdayValue = 0;
  let yesterdayKnown = false;
  for (const h of holdingRows) {
    const value = h.institutionValue != null ? Number(h.institutionValue) : 0;
    currentValue += value;
    const close = h.closePrice != null ? Number(h.closePrice) : null;
    const qty = Number(h.quantity);
    if (close != null) {
      yesterdayValue += qty * close;
      yesterdayKnown = true;
    } else {
      // No closePrice → fall back to current value (no day delta contribution)
      yesterdayValue += value;
    }
  }

  // Snapshot index: date → totalValue
  const snapshotIndex = new Map<string, number>();
  for (const s of snapshotRows) {
    snapshotIndex.set(s.snapshotDate, Number(s.totalValue));
  }
  const earliestSnapshotDate =
    snapshotRows.length > 0
      ? snapshotRows[snapshotRows.length - 1].snapshotDate
      : null;

  const walkbackTxns: WalkbackTxn[] = txnRows.map((r) => ({
    date: r.date,
    amount: Number(r.amount),
    type: r.type ?? '',
  }));

  // Build each range's points.
  const byRange: Record<RangeKey, RangeData> = {
    '1D': buildOneDayRange(today, currentValue, yesterdayValue, yesterdayKnown),
    '1M': buildRange(
      '1M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '3M': buildRange(
      '3M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '6M': buildRange(
      '6M',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '1Y': buildRange(
      '1Y',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
    '5Y': buildRange(
      '5Y',
      today,
      currentValue,
      walkbackTxns,
      snapshotIndex,
      earliestSnapshotDate,
    ),
  };

  const hasAnyData =
    currentValue > 0 ||
    snapshotRows.length > 0 ||
    walkbackTxns.length > 0;

  return { byRange, hasAnyData };
}

function buildOneDayRange(
  today: Date,
  currentValue: number,
  yesterdayValue: number,
  yesterdayKnown: boolean,
): RangeData {
  if (!yesterdayKnown || yesterdayValue === 0) {
    return {
      points: [],
      seamDate: null,
      startValue: null,
      endValue: null,
      delta: null,
      deltaPct: null,
    };
  }
  const yesterdayIso = toIsoDate(
    new Date(today.getTime() - 86_400_000),
  );
  const todayIso = toIsoDate(today);
  const points: ChartPoint[] = [
    { date: yesterdayIso, value: yesterdayValue, estimated: false },
    { date: todayIso, value: currentValue, estimated: false },
  ];
  const delta = currentValue - yesterdayValue;
  return {
    points,
    seamDate: null,
    startValue: yesterdayValue,
    endValue: currentValue,
    delta,
    deltaPct: yesterdayValue !== 0 ? (delta / yesterdayValue) * 100 : null,
  };
}

function buildRange(
  range: RangeKey,
  today: Date,
  currentValue: number,
  walkbackTxns: WalkbackTxn[],
  snapshotIndex: Map<string, number>,
  earliestSnapshotDate: string | null,
): RangeData {
  const daysBack = DAYS_BACK_BY_RANGE[range];
  // Walkback from today provides daysBack+1 estimated points (oldest → today)
  const walkbackPoints: WalkbackPoint[] = walkbackPortfolio(
    currentValue,
    walkbackTxns,
    daysBack,
    today,
  );

  // Replace points with real snapshot values where available; flip
  // estimated → false for those dates.
  const merged: ChartPoint[] = walkbackPoints.map((p) => {
    const snapshot = snapshotIndex.get(p.date);
    if (snapshot != null) {
      return { date: p.date, value: snapshot, estimated: false };
    }
    return { date: p.date, value: p.value, estimated: true };
  });

  if (merged.length === 0) {
    return {
      points: [],
      seamDate: null,
      startValue: null,
      endValue: null,
      delta: null,
      deltaPct: null,
    };
  }

  // Compute seam: earliest snapshot date that falls within the range.
  const rangeStartDate = merged[0].date;
  const seamDate =
    earliestSnapshotDate != null && earliestSnapshotDate >= rangeStartDate
      ? earliestSnapshotDate
      : null;

  const startValue = merged[0].value;
  const endValue = merged[merged.length - 1].value;
  const delta = endValue - startValue;

  return {
    points: merged,
    seamDate,
    startValue,
    endValue,
    delta,
    deltaPct: startValue !== 0 ? (delta / startValue) * 100 : null,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/portfolio-history.ts
git commit -m "feat(r3.4): T4 getPortfolioHistory query"
```

---

## Task 5: Side-effect — `recordPortfolioSnapshot` + dispatcher integration

**Files:**
- Create: `src/lib/investments/snapshots.ts`
- Modify: `src/lib/sync/dispatcher.ts`

- [ ] **Step 1: Implement `recordPortfolioSnapshot`**

Create `src/lib/investments/snapshots.ts`:

```ts
import { db } from '@/lib/db';
import { portfolioSnapshots } from '@/lib/db/schema';
import { getPortfolioSummary } from '@/lib/db/queries/investments';

function todayIsoUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Write a daily portfolio snapshot for the user. Idempotent: multiple
 * calls on the same day upsert via ON CONFLICT (user_id, snapshot_date)
 * — latest write wins. No-op for users with no investment accounts.
 *
 * Called from the sync dispatcher's success path after a successful
 * syncExternalItem. Failures should be caught at the call site so they
 * don't fail the sync; they get logged to error_log under
 * 'portfolio.snapshot'.
 */
export async function recordPortfolioSnapshot(userId: string): Promise<void> {
  const summary = await getPortfolioSummary(userId);
  if (summary.accountCount === 0) return;

  const snapshotDate = todayIsoUtc();
  await db
    .insert(portfolioSnapshots)
    .values({
      userId,
      snapshotDate,
      totalValue: String(summary.totalValue),
      totalCostBasis: String(summary.totalCost),
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.snapshotDate],
      set: {
        totalValue: String(summary.totalValue),
        totalCostBasis: String(summary.totalCost),
      },
    });
}
```

- [ ] **Step 2: Wire into the dispatcher**

Modify `src/lib/sync/dispatcher.ts`. Current shape selects `provider` and returns directly inside the switch; we need (a) to also select `userId`, and (b) to attempt the snapshot AFTER a successful per-provider sync, wrapped so failure doesn't propagate.

Replace the entire `syncExternalItem` function body with this version:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { externalItems } from '@/lib/db/schema';
import { recordPortfolioSnapshot } from '@/lib/investments/snapshots';
import { logError } from '@/lib/logger';
import { syncItem as syncPlaidItem } from '@/lib/plaid/sync';
import { syncSnaptradeItem } from '@/lib/snaptrade/sync';

export type SyncDispatchResult =
  | { provider: 'plaid'; summary: Awaited<ReturnType<typeof syncPlaidItem>> }
  | {
      provider: 'snaptrade';
      summary: Awaited<ReturnType<typeof syncSnaptradeItem>>;
    };

/**
 * Provider-aware sync entry point. Routes to the correct
 * provider-specific orchestrator based on the `provider` discriminator
 * on external_item.
 *
 * After a successful per-provider sync, attempts a best-effort portfolio
 * snapshot write. Snapshot failures don't fail the sync; they're logged
 * to error_log under 'portfolio.snapshot' and surfaced in the daily
 * digest.
 */
export async function syncExternalItem(
  externalItemId: string,
): Promise<SyncDispatchResult> {
  const [row] = await db
    .select({
      provider: externalItems.provider,
      userId: externalItems.userId,
    })
    .from(externalItems)
    .where(eq(externalItems.id, externalItemId));
  if (!row) {
    throw new Error(`external_item ${externalItemId} not found`);
  }

  let result: SyncDispatchResult;
  try {
    switch (row.provider) {
      case 'plaid': {
        const summary = await syncPlaidItem(externalItemId);
        result = { provider: 'plaid', summary };
        break;
      }
      case 'snaptrade': {
        const summary = await syncSnaptradeItem(externalItemId);
        result = { provider: 'snaptrade', summary };
        break;
      }
      default:
        throw new Error(
          `external_item ${externalItemId} has unknown provider=${row.provider}`,
        );
    }
  } catch (err) {
    await logError('sync.dispatcher', err, {
      externalItemId,
      provider: row.provider,
    });
    throw err;
  }

  // Best-effort portfolio snapshot. Sync succeeded — try to capture
  // a daily totals row. Failures don't propagate; they're surfaced via
  // error_log + daily digest.
  try {
    await recordPortfolioSnapshot(row.userId);
  } catch (snapshotErr) {
    await logError('portfolio.snapshot', snapshotErr, { userId: row.userId });
  }

  return result;
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Run full test suite to verify no regressions**

```bash
npm run test 2>&1 | tail -5
```

Expected: all passing (current 578 + walkback's 13 + allocation's 19 = ~610).

- [ ] **Step 5: Manual smoke test**

Spin up dev:

```bash
npm run dev
```

In another terminal, trigger a sync via the /settings "Sync now" button (or hit `/api/cron/sync` with the bearer if you have it). Then verify a row was written:

```bash
psql "$DIRECT_DATABASE_URL" -c "SELECT user_id, snapshot_date, total_value, total_cost_basis FROM portfolio_snapshot ORDER BY created_at DESC LIMIT 3;"
```

Expected: at least one new row dated today with non-zero `total_value` matching the dashboard's investments figure.

- [ ] **Step 6: Commit**

```bash
git add src/lib/investments/snapshots.ts src/lib/sync/dispatcher.ts
git commit -m "feat(r3.4): T5 recordPortfolioSnapshot + dispatcher integration"
```

---

## Task 6: Server component — `<InvestmentsPageHeader>`

**Files:**
- Create: `src/components/investments/investments-page-header.tsx`

- [ ] **Step 1: Implement the header**

Create `src/components/investments/investments-page-header.tsx`:

```tsx
/**
 * /investments page header. Mirrors <RecurringPageHeader> /
 * <TransactionsPageHeader> structure: eyebrow + h1 + page sub on the
 * left, freshness meta on the right.
 *
 * Eyebrow says "Long horizon" (per R.3.4 SPEC #6) — the only R.3
 * sub-phase where eyebrow diverges from the sidebar group (investments
 * sits under Records, but the brand voice for this page is
 * long-horizon).
 */
export function InvestmentsPageHeader({
  freshnessHeadline,
  freshnessCaveat,
}: {
  freshnessHeadline: string;
  freshnessCaveat: string | null;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Long horizon
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
            Investments
          </h1>
        </div>
        <div className="hidden text-right text-xs text-[--text-2] sm:block">
          <div>{freshnessHeadline}</div>
          {freshnessCaveat && (
            <div className="mt-0.5 text-[--text-3]">{freshnessCaveat}</div>
          )}
        </div>
      </div>
      <p className="max-w-xl text-sm text-[--text-2]">
        Where your money is working. Quiet by design — markets move, but the
        plan doesn't.
      </p>
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean (file is exported but not yet consumed; TS doesn't error on unused exports).

- [ ] **Step 3: Commit**

```bash
git add src/components/investments/investments-page-header.tsx
git commit -m "feat(r3.4): T6 InvestmentsPageHeader server component"
```

---

## Task 7: Server component — `<PortfolioHero>`

**Files:**
- Create: `src/components/investments/portfolio-hero.tsx`

- [ ] **Step 1: Implement the hero**

Create `src/components/investments/portfolio-hero.tsx`:

```tsx
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

/**
 * Hero summary for /investments. Replaces the prior <PortfolioSummary>
 * 3-cell layout with a prototype-style hero: large portfolio value
 * (the biggest object on the page), cost-basis delta line below,
 * and a 2-cell aside (Cost basis · Holdings count).
 *
 * Day delta is intentionally absent here — it moves to the
 * <PerformanceChart>'s 1D range tab per R.3.4 SPEC #7. Per-position
 * day delta is still visible on <HoldingsView> rows.
 */
export function PortfolioHero({ summary }: { summary: PortfolioSummary }) {
  const hasCostBasis = summary.costedHoldingsCount > 0;
  const gainLoss = hasCostBasis ? summary.unrealizedGainLoss : null;
  const gainPct = summary.unrealizedGainLossPct;
  const isUp = gainLoss != null && gainLoss >= 0;
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="grid grid-cols-1 gap-6 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:grid-cols-3 md:gap-8 md:p-8">
      <div className="md:col-span-2">
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Portfolio value · today
        </p>
        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-tight text-[--text] md:text-5xl">
          {formatCurrency(summary.totalValue)}
        </p>
        {gainLoss != null ? (
          <p
            className={cn(
              'mt-3 inline-flex items-center gap-1 font-mono text-sm tabular-nums',
              isUp ? 'text-positive' : 'text-destructive',
            )}
          >
            <Arrow className="h-3.5 w-3.5" />
            {formatCurrency(gainLoss, { signed: true })}
            {gainPct != null && (
              <span className="text-[--text-3]">
                {' · '}
                {formatPercent(gainPct)}
              </span>
            )}
            <span className="ml-2 text-[--text-3]">since cost basis</span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-[--text-3]">
            No cost basis from sources yet
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-1 md:gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Cost basis
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[--text]">
            {hasCostBasis ? formatCurrency(summary.totalCost) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Holdings
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[--text]">
            {summary.costedHoldingsCount > 0 ? summary.costedHoldingsCount : '—'}
            <span className="ml-1 text-xs font-normal text-[--text-3]">
              · {summary.accountCount}{' '}
              {summary.accountCount === 1 ? 'account' : 'accounts'}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/investments/portfolio-hero.tsx
git commit -m "feat(r3.4): T7 PortfolioHero server component"
```

---

## Task 8: Client component — `<PerformanceChart>`

**Files:**
- Create: `src/components/investments/performance-chart.tsx`

- [ ] **Step 1: Implement the chart**

Create `src/components/investments/performance-chart.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PortfolioHistory,
  RangeKey,
} from '@/lib/db/queries/portfolio-history';
import { cn, formatCurrency } from '@/lib/utils';

const RANGES: RangeKey[] = ['1D', '1M', '3M', '6M', '1Y', '5Y'];

/**
 * Range-tabbed performance chart. Two Recharts <Line> series share an
 * X axis: one solid line for snapshot data (real), one dashed line
 * for walkback data (estimated). Recharts skips null values so each
 * line renders only where its data is non-null. The seam date appears
 * in both arrays so the two lines visually connect.
 *
 * 1D tab is special-cased — when fewer than 2 points exist, the tab
 * is rendered but disabled (no closePrice data yet from sync).
 *
 * Strike-3 RSC boundary guard: props are plain-data only. The
 * `byRange` value is a Record of arrays; no function props cross the
 * server→client boundary.
 */
export function PerformanceChart({ history }: { history: PortfolioHistory }) {
  const [range, setRange] = useState<RangeKey>('1M');
  const data = history.byRange[range];
  const oneDayDisabled = history.byRange['1D'].points.length < 2;

  // Build paired data for Recharts: { date, valueReal, valueEstimated }
  // Each point sets EITHER valueReal or valueEstimated (never both),
  // EXCEPT the seam date — that one sets BOTH so the dashed line ends
  // exactly where the solid line begins.
  const seriesData = useMemo(() => {
    return data.points.map((p) => {
      const isSeam = data.seamDate != null && p.date === data.seamDate;
      const isEstimated = p.estimated;
      return {
        date: p.date,
        valueReal: !isEstimated ? p.value : isSeam ? p.value : null,
        valueEstimated: isEstimated || isSeam ? p.value : null,
      };
    });
  }, [data]);

  const isUp = data.delta != null && data.delta >= 0;

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Performance
          </p>
          <p className="mt-1 text-sm text-[--text-2]">
            {range} change ·{' '}
            {data.delta != null ? (
              <span
                className={cn(
                  'font-mono tabular-nums',
                  isUp ? 'text-positive' : 'text-destructive',
                )}
              >
                {formatCurrency(data.delta, { signed: true })}
              </span>
            ) : (
              <span className="text-[--text-3]">—</span>
            )}
          </p>
        </div>
        <RangeTabs
          range={range}
          onChange={setRange}
          oneDayDisabled={oneDayDisabled}
        />
      </header>

      {data.points.length === 0 ? (
        <EmptyState range={range} />
      ) : (
        <>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--hairline)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'var(--text-2)' }}
                  formatter={(value: number | null) =>
                    value != null ? formatCurrency(value) : '—'
                  }
                />
                <Line
                  type="monotone"
                  dataKey="valueEstimated"
                  stroke="var(--accent)"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="valueReal"
                  stroke="var(--accent)"
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between font-mono text-xs tabular-nums text-[--text-3]">
            <span>
              {data.startValue != null ? formatCurrency(data.startValue) : '—'}
            </span>
            {data.seamDate && (
              <span className="text-[--text-2]">
                Earlier values estimated from recorded transactions
              </span>
            )}
            <span>
              {data.endValue != null ? formatCurrency(data.endValue) : '—'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function RangeTabs({
  range,
  onChange,
  oneDayDisabled,
}: {
  range: RangeKey;
  onChange: (next: RangeKey) => void;
  oneDayDisabled: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-[--hairline] p-1">
      {RANGES.map((r) => {
        const disabled = r === '1D' && oneDayDisabled;
        const active = range === r;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => onChange(r)}
            className={cn(
              'rounded-full px-3 py-1 font-mono text-xs tabular-nums transition-colors',
              active && 'bg-[--accent]/12 text-[--accent]',
              !active && !disabled && 'text-[--text-2] hover:text-[--text]',
              disabled && 'cursor-not-allowed text-[--text-3] opacity-50',
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ range }: { range: RangeKey }) {
  return (
    <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-[--hairline] text-center text-sm text-[--text-3]">
      <div>
        <p>Trajectory builds with daily snapshots</p>
        <p className="mt-1 text-xs">
          {range === '1D'
            ? 'Day delta will appear once price data lands'
            : 'Run a sync to capture today, then check back tomorrow.'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Recharts is installed**

```bash
grep '"recharts"' package.json
```

Expected: a version line. If missing, the existing dashboard hero already uses Recharts, so it must be present — re-grep with full lockfile if surprised.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/investments/performance-chart.tsx
git commit -m "feat(r3.4): T8 PerformanceChart client component (Recharts dual-line)"
```

---

## Task 9: Server component — `<AllocationSection>`

**Files:**
- Create: `src/components/investments/allocation-section.tsx`

- [ ] **Step 1: Implement the section**

Create `src/components/investments/allocation-section.tsx`:

```tsx
import type { AllocationSegment, AllocationClass } from '@/lib/investments/allocation';
import { formatCurrency } from '@/lib/utils';

// Restrained palette per DESIGN.md restraint floor. Single hue family
// (accent green) graded by class importance; non-equity classes use
// muted neutrals or signal hues. Avoids the "Christmas tree" antipattern.
const CLASS_PALETTE: Record<AllocationClass, string> = {
  Equity: 'var(--accent-strong)',
  ETF: 'var(--accent)',
  'Mutual fund': 'var(--accent)/70',
  'Bond / fixed income': 'var(--semantic-caution)',
  Cash: 'var(--text-3)',
  Other: 'var(--text-3)/60',
};

/**
 * Single horizontal stacked bar + legend. Sorted by value desc with
 * 'Other' pinned last (per buildAllocation).
 */
export function AllocationSection({
  allocation,
}: {
  allocation: AllocationSegment[];
}) {
  if (allocation.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Allocation
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[--text]">
          How it's distributed
        </h2>
      </header>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[--hairline]">
        {allocation.map((seg) => (
          <div
            key={seg.name}
            style={{
              width: `${seg.pct}%`,
              background: CLASS_PALETTE[seg.name],
            }}
            title={`${seg.name} · ${seg.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {allocation.map((seg) => (
          <li
            key={seg.name}
            className="flex items-center gap-3"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CLASS_PALETTE[seg.name] }}
            />
            <span className="flex-1 text-[--text-2]">{seg.name}</span>
            <span className="font-mono tabular-nums text-[--text-3]">
              {seg.pct.toFixed(1)}%
            </span>
            <span className="w-24 text-right font-mono tabular-nums text-[--text]">
              {formatCurrency(seg.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/investments/allocation-section.tsx
git commit -m "feat(r3.4): T9 AllocationSection server component"
```

---

## Task 10: Client component — `<HoldingsView>`

**Files:**
- Create: `src/components/investments/holdings-view.tsx`

- [ ] **Step 1: Implement the view**

Create `src/components/investments/holdings-view.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { FlatHolding } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type ViewKey = 'positions' | 'accounts';

/**
 * Positions/Accounts tabbed holdings render. Replaces the prior
 * <HoldingsTable> (sortable columns + group-by toggle, both dropped
 * per R.3.4 wholesale-IA scope decision).
 *
 * Strike-3 RSC boundary guard: props are plain-data only —
 * holdings: FlatHolding[]. No functions, no forwardRef components.
 */
export function HoldingsView({ holdings }: { holdings: FlatHolding[] }) {
  const [view, setView] = useState<ViewKey>('positions');

  const accountsBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { accountId: string; accountName: string; accountMask: string | null; value: number; holdings: FlatHolding[] }
    >();
    for (const h of holdings) {
      const key = h.accountId;
      const entry = map.get(key) ?? {
        accountId: h.accountId,
        accountName: h.accountName,
        accountMask: h.accountMask,
        value: 0,
        holdings: [],
      };
      entry.value += h.institutionValue ?? 0;
      entry.holdings.push(h);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [holdings]);

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Holdings
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[--text]">
            {view === 'positions' ? 'By position' : 'By account'}
          </h2>
        </div>
        <div className="flex gap-1 rounded-full border border-[--hairline] p-1">
          {(['positions', 'accounts'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-full px-3 py-1 text-xs capitalize transition-colors',
                view === v && 'bg-[--accent]/12 text-[--accent]',
                view !== v && 'text-[--text-2] hover:text-[--text]',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {view === 'positions' ? (
        <PositionsList holdings={holdings} />
      ) : (
        <AccountsList breakdown={accountsBreakdown} />
      )}
    </section>
  );
}

function PositionsList({ holdings }: { holdings: FlatHolding[] }) {
  if (holdings.length === 0) {
    return (
      <p className="px-3 py-12 text-center text-sm text-[--text-3]">
        No holdings reported yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[--hairline]">
      {holdings.map((h) => {
        const value = h.institutionValue ?? 0;
        const gl =
          h.costBasis != null && h.institutionValue != null
            ? h.institutionValue - h.costBasis
            : null;
        const glPct = gl != null && h.costBasis ? gl / h.costBasis : null;
        const isUp = gl != null && gl >= 0;
        return (
          <li
            key={h.id}
            className="grid grid-cols-2 gap-3 py-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]"
          >
            <div className="col-span-2 md:col-span-1">
              <p className="font-mono text-sm font-medium text-[--text]">
                {h.ticker ?? '—'}
              </p>
              <p className="truncate text-xs text-[--text-2]">
                {h.securityName ?? '—'}
              </p>
              <p className="text-xs text-[--text-3]">
                {prettifyType(h.securityType)} · {h.accountName}
                {h.accountMask && (
                  <span className="text-[--text-3]/80">
                    {' '}····{h.accountMask}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-[--text-2]">
              {h.quantity.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              <span className="text-[--text-3]">sh</span>
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-[--text-2]">
              {h.institutionPrice != null
                ? formatCurrency(h.institutionPrice)
                : '—'}
            </div>
            <div className="text-right font-mono text-sm font-medium tabular-nums text-[--text]">
              {formatCurrency(value)}
            </div>
            <div
              className={cn(
                'text-right font-mono text-xs tabular-nums',
                gl == null
                  ? 'text-[--text-3]'
                  : isUp
                    ? 'text-positive'
                    : 'text-destructive',
              )}
            >
              {gl == null ? '—' : formatCurrency(gl, { signed: true })}
              {glPct != null && (
                <div className="text-[10px] opacity-80">
                  {formatPercent(glPct)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AccountsList({
  breakdown,
}: {
  breakdown: ReturnType<
    typeof Object.assign<unknown, unknown>
  > extends never
    ? never
    : Array<{
        accountId: string;
        accountName: string;
        accountMask: string | null;
        value: number;
        holdings: FlatHolding[];
      }>;
}) {
  if (breakdown.length === 0) {
    return (
      <p className="px-3 py-12 text-center text-sm text-[--text-3]">
        No accounts reported yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {breakdown.map((acct) => (
        <div
          key={acct.accountId}
          className="rounded-xl border border-[--hairline] p-4"
        >
          <header className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[--text]">
                {acct.accountName}
                {acct.accountMask && (
                  <span className="ml-1 text-xs text-[--text-3]">
                    ····{acct.accountMask}
                  </span>
                )}
              </p>
              <p className="text-xs text-[--text-3]">
                {acct.holdings.length}{' '}
                {acct.holdings.length === 1 ? 'position' : 'positions'}
              </p>
            </div>
            <p className="font-mono text-base font-semibold tabular-nums text-[--text]">
              {formatCurrency(acct.value)}
            </p>
          </header>
          <ul className="mt-3 space-y-1.5">
            {acct.holdings.map((h) => (
              <li
                key={h.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-medium text-[--text]">
                    {h.ticker ?? '—'}
                  </span>
                  <span className="truncate text-[--text-2]">
                    {h.securityName ?? '—'}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[--text-2]">
                  {formatCurrency(h.institutionValue ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function prettifyType(t: string | null): string {
  if (!t) return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If the AccountsList prop typing fails (the `ReturnType` trick is just for inference), simplify by defining `type AccountBreakdown = {accountId; accountName; accountMask; value; holdings}` directly above `AccountsList` and inlining.

- [ ] **Step 3: If typecheck failed, simplify `AccountsList` prop type**

Replace the AccountsList prop type with:

```tsx
type AccountBreakdown = {
  accountId: string;
  accountName: string;
  accountMask: string | null;
  value: number;
  holdings: FlatHolding[];
};

function AccountsList({
  breakdown,
}: {
  breakdown: AccountBreakdown[];
}) {
  // ... unchanged body
}
```

Also update the `accountsBreakdown` typing in the parent to `AccountBreakdown[]`.

Re-run typecheck:

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/investments/holdings-view.tsx
git commit -m "feat(r3.4): T10 HoldingsView client component (Positions/Accounts tabs)"
```

---

## Task 11: Restyle — `<InvestmentTxnsTable>` with date grouping

**Files:**
- Modify: `src/components/investments/investment-txns-table.tsx`

- [ ] **Step 1: Inspect current implementation**

Read the current file to identify exact lines to swap. The file is ~136 lines; the entire shape changes (table → date-grouped list). Treat this as a wholesale rewrite within the same file.

- [ ] **Step 2: Rewrite the file**

Replace the entire contents of `src/components/investments/investment-txns-table.tsx` with:

```tsx
import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';
import type { RecentInvestmentTxn } from '@/lib/db/queries/investments';
import { humanizeDate } from '@/lib/format/date';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  transactions: RecentInvestmentTxn[];
};

/**
 * Recent investment activity, date-grouped via R.3.3's
 * groupTransactionsByDate. Section eyebrow renamed to "Recent
 * activity" (was "Recent investment activity") — the parent section
 * context is /investments, so the "investment" qualifier is redundant.
 *
 * Type pill uses a single muted tone per DESIGN.md restraint floor;
 * categorical color is not a semantic axis on this surface.
 */
export function InvestmentTxnsTable({ transactions }: Props) {
  if (transactions.length === 0) return null;

  // groupTransactionsByDate accepts the {date, amount} shape, but
  // RecentInvestmentTxn carries .amount as Plaid's cash-sweep delta
  // (positive = cash OUT of broker). For day-net display purposes
  // we want to flip the sign so a buy reads as a debit; pre-flip via
  // a shallow map before grouping.
  const flippedForDisplay = transactions.map((t) => ({
    ...t,
    amount: -t.amount,
  }));
  const groups = groupTransactionsByDate(flippedForDisplay);

  return (
    <section className="hidden space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:block md:p-8">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Recent activity · {transactions.length}
        </p>
      </header>

      <ul className="divide-y divide-[--hairline]">
        {groups.map((group) => {
          const dayNetUp = group.dayNet >= 0;
          return (
            <li key={group.dateIso}>
              <div className="flex items-baseline justify-between gap-3 py-2.5 text-xs text-[--text-3]">
                <span className="font-mono uppercase tracking-[0.08em]">
                  {humanizeDate(group.dateIso)}
                </span>
                <span
                  className={cn(
                    'font-mono tabular-nums',
                    dayNetUp ? 'text-positive' : 'text-destructive',
                  )}
                >
                  {dayNetUp ? '↑' : '↓'}{' '}
                  {formatCurrency(Math.abs(group.dayNet))}
                </span>
              </div>
              <ul className="space-y-1.5 pb-3">
                {group.rows.map((t) => (
                  <Row key={t.id} t={t as RecentInvestmentTxn} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Row({ t }: { t: RecentInvestmentTxn }) {
  // Caller pre-flipped amount; render directly.
  const isPositive = t.amount > 0;

  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <TypePill type={t.type} subtype={t.subtype} />
          {t.ticker && (
            <span className="font-mono text-xs font-medium text-[--text]">
              {t.ticker}
            </span>
          )}
          <span className="truncate text-[--text-2]">
            {t.securityName ?? t.name ?? '—'}
          </span>
        </div>
        <p className="text-xs text-[--text-3]">
          {t.accountName}
          {t.accountMask && (
            <span className="text-[--text-3]/70"> ····{t.accountMask}</span>
          )}
          {t.quantity != null && (
            <span className="ml-2 font-mono tabular-nums">
              {t.quantity.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              sh
            </span>
          )}
        </p>
      </div>
      <div
        className={cn(
          'shrink-0 font-mono tabular-nums',
          isPositive ? 'text-positive' : 'text-[--text]',
        )}
      >
        {formatCurrency(t.amount, { signed: true })}
      </div>
    </li>
  );
}

function TypePill({
  type,
  subtype,
}: {
  type: string | null;
  subtype: string | null;
}) {
  const label = type ?? '—';
  return (
    <span
      className="inline-flex items-center rounded-md bg-[--hairline] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[--text-2]"
      title={subtype ?? undefined}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Verify `humanizeDate` is exported from format/date**

```bash
grep -n "export function humanizeDate\|export.*humanizeDate" src/lib/format/date.ts
```

Expected: a line confirming the export. If missing, this is a known dependency from R.3.3 — verify R.3.3 actually shipped it (check git log).

- [ ] **Step 4: Verify `groupTransactionsByDate` shape**

```bash
grep -n "export.*groupTransactionsByDate\|dayNet\|dateIso" src/lib/transactions/group-by-date.ts | head -10
```

Expected: confirms `dateIso`, `dayNet`, and `rows` fields per R.3.3 SPEC. If the helper uses different field names, adjust the consumer here to match exactly.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If there's a type error because `groupTransactionsByDate` is generic on row shape, you may need to pass an explicit type parameter: `groupTransactionsByDate<RecentInvestmentTxn>(flippedForDisplay)`.

- [ ] **Step 6: Commit**

```bash
git add src/components/investments/investment-txns-table.tsx
git commit -m "feat(r3.4): T11 InvestmentTxnsTable token swap + date grouping"
```

---

## Task 12: Restyle — `<MobileInvestments>` (recent-activity only)

**Files:**
- Modify: `src/components/investments/mobile-investments.tsx`

The holdings mobile path is absorbed by the responsive `<HoldingsView>` — we drop the holdings `<MobileList>` consumer. Only the recent-activity `<MobileList>` consumer remains.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/components/investments/mobile-investments.tsx` with:

```tsx
'use client';

import type { RecentInvestmentTxn } from '@/lib/db/queries/investments';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileList } from '@/components/operator/mobile-list';

/**
 * Mobile-only render for /investments recent activity. Paired with
 * the desktop <InvestmentTxnsTable> via CSS swap. Holdings mobile
 * path is gone — the responsive <HoldingsView> handles both
 * breakpoints fluidly.
 */
export function MobileInvestments({
  transactions,
}: {
  transactions: RecentInvestmentTxn[];
}) {
  if (transactions.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-[--hairline] bg-[--surface] p-5 md:hidden">
      <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
        Recent activity · {transactions.length}
      </p>
      <MobileList<RecentInvestmentTxn>
        rows={transactions}
        config={{
          rowKey: (t) => t.id,
          dateField: (t) => t.date,
          topLine: (t) => (
            <span className="flex items-baseline gap-2">
              {t.ticker && (
                <span className="font-mono text-xs font-medium text-[--text]">
                  {t.ticker}
                </span>
              )}
              <span className="truncate text-[--text]">
                {t.securityName ?? t.name ?? '—'}
              </span>
            </span>
          ),
          secondLine: (t) => {
            const type = t.type ?? '—';
            const acct = t.accountMask
              ? `${t.accountName} ····${t.accountMask}`
              : t.accountName;
            return `${type.toUpperCase()} · ${acct}`;
          },
          rightCell: (t) => {
            const display = -t.amount;
            const isPositive = display > 0;
            return (
              <span className={cn(isPositive && 'text-positive')}>
                {formatCurrency(display, { signed: true })}
              </span>
            );
          },
          rightSubCell: (t) =>
            t.quantity != null
              ? `${t.quantity.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })} sh`
              : null,
        }}
      />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean. Note: this is a `'use client'` file that uses `<MobileList>`'s config-of-functions — that's the existing strike-2 surface, NOT a new RSC-boundary risk. The functions live inside a client component already; they don't cross from a server caller.

- [ ] **Step 3: Commit**

```bash
git add src/components/investments/mobile-investments.tsx
git commit -m "feat(r3.4): T12 MobileInvestments token swap (recent-activity only)"
```

---

## Task 13: Page rewrite + obsolete-file deletion + revalidatePath wiring

**Files:**
- Modify: `src/app/(app)/investments/page.tsx` (wholesale)
- Delete: `src/components/investments/group-by-toggle.tsx`
- Delete: `src/components/investments/holdings-table.tsx`
- Delete: `src/components/investments/portfolio-summary.tsx`
- Audit + modify: `src/lib/plaid/actions.ts` (revalidatePath wiring)
- Audit + modify: `src/lib/sync/actions.ts` (revalidatePath wiring — if missing)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/(app)/investments/page.tsx` with:

```tsx
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { auth } from '@/auth';
import { AllocationSection } from '@/components/investments/allocation-section';
import { HoldingsView } from '@/components/investments/holdings-view';
import { InvestmentsPageHeader } from '@/components/investments/investments-page-header';
import { InvestmentTxnsTable } from '@/components/investments/investment-txns-table';
import { MobileInvestments } from '@/components/investments/mobile-investments';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { PortfolioHero } from '@/components/investments/portfolio-hero';
import { Button } from '@/components/ui/button';
import {
  getHoldingsFlat,
  getPortfolioSummary,
  getRecentInvestmentTransactions,
} from '@/lib/db/queries/investments';
import { getPortfolioHistory } from '@/lib/db/queries/portfolio-history';
import { getSourceHealth } from '@/lib/db/queries/health';
import { formatFreshness } from '@/lib/format/freshness';
import { buildAllocation } from '@/lib/investments/allocation';

export default async function InvestmentsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [summary, holdings, txns, history, sourceHealth] = await Promise.all([
    getPortfolioSummary(session.user.id),
    getHoldingsFlat(session.user.id),
    getRecentInvestmentTransactions(session.user.id, 20),
    getPortfolioHistory(session.user.id),
    getSourceHealth(session.user.id),
  ]);

  if (summary.accountCount === 0) {
    return <EmptyState />;
  }

  // Capability-aware freshness: investments-page-specific. A brokerage
  // failing its investments capability (but succeeding transactions)
  // shows stale HERE, even if /transactions reads it as fresh.
  const investmentSources = sourceHealth
    .map((s) => {
      const cap = s.byCapability.investments;
      return {
        name: s.institutionName ?? 'Brokerage',
        lastSyncAt:
          cap?.kind === 'tracked' ? cap.lastSuccessAt : null,
      };
    });
  const freshness = formatFreshness({
    sources: investmentSources,
    now: new Date(),
  });

  const allocation = buildAllocation(
    holdings.map((h) => ({
      securityType: h.securityType,
      institutionValue: h.institutionValue,
    })),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <InvestmentsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <PortfolioHero summary={summary} />
      <PerformanceChart history={history} />
      <AllocationSection allocation={allocation} />
      <HoldingsView holdings={holdings} />
      <InvestmentTxnsTable transactions={txns} />
      <MobileInvestments transactions={txns} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[--accent]/12 text-[--accent]">
          <TrendingUp className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[--text]">
            No brokerage connected yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
            Link a brokerage, IRA, 401(k), or HSA via Plaid or SnapTrade to see
            holdings, day moves, and recent activity here.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect a brokerage
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete obsolete components**

```bash
git rm src/components/investments/group-by-toggle.tsx
git rm src/components/investments/holdings-table.tsx
git rm src/components/investments/portfolio-summary.tsx
```

- [ ] **Step 3: Audit revalidatePath wiring on sync actions**

Check that sync actions revalidate `/investments`:

```bash
grep -n "revalidatePath" src/lib/plaid/actions.ts src/lib/sync/actions.ts 2>/dev/null
```

Expected: at least `revalidatePath('/settings')` / `revalidatePath('/dashboard')` calls. If `'/investments'` is missing from any `syncItemAction` / `syncAllItemsAction`, add it. Pattern (per R.3.2's symmetric addition for `/recurring`):

```ts
revalidatePath('/dashboard');
revalidatePath('/transactions');
revalidatePath('/recurring');
revalidatePath('/investments');  // ADD
revalidatePath('/settings');
```

If both files lack `'/investments'`, add it to both. If only one lacks it, add to that one.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If there's a missing-export error for `PortfolioSummary` type (since we removed `portfolio-summary.tsx`), confirm the type still exists at `src/lib/db/queries/investments.ts` — the type and the component shared a name; the query module owns the type and the component should be deleted independently.

- [ ] **Step 5: Run full test suite**

```bash
npm run test 2>&1 | tail -5
```

Expected: all passing (target ~596 = 578 baseline + 13 walkback + 19 allocation - any obsolete tests if applicable).

- [ ] **Step 6: Build**

```bash
npm run build 2>&1 | tail -15
```

**IMPORTANT**: Stop `npm run dev` first if it's running (per CLAUDE.md > "Don't run `npm run build` while `next dev` is running").

Expected:
- 27 / 27 pages compile (no route delta from R.3.4)
- No RSC serialization errors
- No "function cannot be passed" errors

- [ ] **Step 7: Commit**

```bash
git add -A src/app/\(app\)/investments src/components/investments src/lib/plaid/actions.ts src/lib/sync/actions.ts
git commit -m "feat(r3.4): T13 page rewrite + delete obsolete components + revalidatePath"
```

---

## Task 14: UAT polish reservation

**Files:** (none — manual walk + reactive polish commits)

- [ ] **Step 1: Restart dev**

```bash
npm run dev
```

Open `http://localhost:3000/investments` in the browser. Sign in with magic link if not already.

- [ ] **Step 2: Walk the SPEC UAT criteria checklist**

Reference [SPEC.md § UAT criteria](SPEC.md#uat-criteria). For each unchecked box:

- Mark `[x]` if visually verified
- Note + fix issues (commit each fix as `fix(r3.4): <short description>`)

Particular high-risk areas to verify carefully:
1. **Chart seam continuity**: The dashed→solid line transition should be visually continuous (no gap). Verify with browser DevTools' SVG inspector — the last `valueEstimated` point and first `valueReal` point should be at the same `(x, y)`.
2. **Capability-aware freshness**: If you have a SnapTrade Fidelity item with `activities-410` and a recent investments-capability success, the freshness should reflect the investments-capability timestamp, NOT the item-level aggregate.
3. **1D tab disabled state**: With no `closePrice` data, 1D should be `disabled`. With `closePrice` data, 1D should show 2 points and a positive/negative chip.
4. **Theme parity**: Walk all sections in dark mode AND light mode. Chart dashed line, allocation bar palette, type pill, and tab toggles should all be readable in both.
5. **Snapshot write verification**: Trigger a sync via /settings, then check:
   ```bash
   psql "$DIRECT_DATABASE_URL" -c "SELECT user_id, snapshot_date, total_value FROM portfolio_snapshot ORDER BY created_at DESC LIMIT 5;"
   ```
   Verify a row exists for today with non-zero `total_value`.

- [ ] **Step 3: Run final verification**

```bash
npm run typecheck && npm run test 2>&1 | tail -3 && npm run build 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4: Update README.md phase status**

Modify `docs/redesign/README.md` to mark R.3.4 as shipped under the phase table. Add a sentence about what shipped (snapshot infrastructure + wholesale-IA restyle + walkback chart). Mirror the format of R.3.1, R.3.2, R.3.3 entries.

```bash
git add docs/redesign/README.md
git commit -m "docs(r3.4): mark R.3.4 Investments shipped in README phase table"
```

- [ ] **Step 5: Verify branch state before merge**

```bash
git rev-parse --abbrev-ref HEAD  # MUST be feat/r3-4-investments
git log --oneline feat/redesign..feat/r3-4-investments
```

Expected: ~13-15 commits (T1 through T14 + any polish fixes).

- [ ] **Step 6: Merge to feat/redesign (no-ff)**

```bash
git checkout feat/redesign
git merge --no-ff feat/r3-4-investments -m "Merge branch 'feat/r3-4-investments' into feat/redesign"
git push origin feat/redesign
git branch -d feat/r3-4-investments
```

- [ ] **Step 7: Update HANDOFF for R.3.5**

Create `docs/redesign/HANDOFF-<TODAY-DATE>.md` mirroring HANDOFF-2026-05-11.md's structure but pointing at R.3.5 Simulator. Include:
- R.3.4 ship summary
- Branch state at handoff time
- R.3.5 reading list
- R.3.5 likely brainstorm axes (simulator IA, override editor restyle, scenario-saving UI)

```bash
git add docs/redesign/HANDOFF-<DATE>.md
git rm docs/redesign/HANDOFF-2026-05-11.md  # roll old handoff out
git commit -m "docs(redesign): session handoff for R.3.5 pickup"
git push origin feat/redesign
```

---

## Self-review

### Spec coverage check

| SPEC section | Covered by task(s) |
|---|---|
| Decision #1 (portfolio_snapshot + walkback) | T1, T2, T4, T5 |
| Decision #2 (wholesale prototype IA) | T7, T10, T13 (delete old components) |
| Decision #3 (security.type allocation) | T3, T9 |
| Decision #4 (recent activity below holdings) | T11, T12 |
| Decision #5 (walkback + estimated flag) | T2, T4, T8 |
| Decision #6 ("Long horizon" eyebrow) | T6 |
| Decision #7 (1D as 4th range tab) | T4 (1D special case), T8 (disabled when no data) |
| Auto-lock: dispatcher trigger | T5 |
| Auto-lock: walkback type filter | T2 (`ALLOWED_TYPES`) |
| Auto-lock: snapshot shape (totals only) | T1 |
| Auto-lock: cost-basis captured | T1, T5 |
| Auto-lock: default range 1M | T8 (`useState<RangeKey>('1M')`) |
| Auto-lock: Recharts dual-Line | T8 |
| Auto-lock: no holdings drilldown | T10 (no click handlers on rows) |
| Auto-lock: single responsive component | T10, T12 (mobile only recent-activity) |
| RSC boundary strike-3 guard | T8, T10 (plain-data props) |
| RLS on new table | T1 step 3 |
| Capability-aware freshness | T13 (page filter) |
| 1D special case (2 points only) | T4 (`buildOneDayRange`) |
| `groupTransactionsByDate` reuse | T11 |
| revalidatePath wiring | T13 step 3 |
| Empty + sparse states | T8 (`EmptyState`), T13 (`accountCount === 0`) |

All SPEC sections traceable to a task.

### Placeholder scan

- No "TBD" / "implement later" / "TODO" in any step.
- Every code step has complete code.
- Every test step has complete test code.
- Every command step has exact command + expected output.

### Type consistency

- `WalkbackPoint`, `ChartPoint`, `RangeData`, `PortfolioHistory`, `RangeKey` defined in T4 and consumed in T8 — names match.
- `AllocationClass`, `AllocationSegment` defined in T3 and consumed in T9 — names match.
- `recordPortfolioSnapshot` signature `(userId: string): Promise<void>` consistent T5 + dispatcher.
- `formatFreshness` returns `{headline, caveat}` per T13 destructure — matches existing freshness.ts.
- `groupTransactionsByDate` consumer in T11 assumes `{dateIso, dayName, dayNet, rows}` per R.3.3 SPEC — verified during T11 step 4.

### Spec gaps

None identified.

---

## Execution Handoff

Plan complete and saved to `docs/redesign/r3-4-investments/PLAN.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

For an R.3.x phase, inline execution has historically matched the user's preferred rhythm: pause between tasks, type "go" or accept inline corrections, commit atomically. Recommendation aligns with that precedent.

**Which approach?**
