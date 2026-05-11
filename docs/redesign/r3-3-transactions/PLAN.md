# Phase R.3.3 — Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/transactions` in Foothold tokens, mount the prototype IA refinements (date-grouped row sections, KPI strip, category chips, freshness strip), and **preserve every shipped operator-tier behavior** (j/k keyboard nav, ⌘↑/⌘↓ page nav, "/" search focus, ⌘K palette, tri-state select-all, sonner-with-undo bulk re-categorize, ⌘K cheatsheet).

**Architecture:** 8 atomic-commit tasks on `feat/r3-3-transactions` (already cut from `feat/redesign` post-R.3.2 merge at `466c31c`). Two new pure helpers (`groupTransactionsByDate`, `categoryToTokens`), one new query (`getMonthlyTransactionTotals`), three new server components (page-header, summary-strip, category-chip). Eight existing component files restyle via token swap; only `<OperatorTable>` has a load-bearing DOM-shape change (flat `<tbody>` → per-group `<tbody>` sections within one `<table>` so column alignment is preserved). The shell stays a single client island per file — no NEW `'use client'` directives.

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Tailwind + Foothold tokens · Vitest 4.

**Date:** 2026-05-11
**Depends on:** [docs/redesign/r3-3-transactions/SPEC.md](SPEC.md) (6 locked decisions + 2 auto-locks), [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r3-2-recurring/PLAN.md](../r3-2-recurring/PLAN.md) (precedent execution rhythm), [docs/redesign/r3-1-goals/PLAN.md](../r3-1-goals/PLAN.md) (page-header pattern)
**Bundle reference:** [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx)
**Branch:** `feat/r3-3-transactions` (cut from `feat/redesign`)
**Estimate:** ~4-5 days

---

## Branching + commit rhythm

All work lands on `feat/r3-3-transactions`. One atomic commit per task. Commit subject format: `feat(r3.3): <task summary>`. T8 polish may produce 0–N fixup commits — `fix(r3.3): <issue>`.

When all 8 tasks ship and UAT passes, branch merges `--no-ff` to `feat/redesign`. The full milestone single-PRs to `main` after R.6.

---

## Pre-flight (one-time before T1)

- [ ] **Confirm working branch**

```bash
git branch --show-current
```
Expected: `feat/r3-3-transactions`

- [ ] **Confirm SPEC commit present**

```bash
git log --oneline -3
```
Expected to contain: `docs(r3.3): lock R.3.3 transactions SPEC` (33abac8)

- [ ] **Snapshot baseline test count**

```bash
npm run test 2>&1 | tail -5
```
Record the passing count. Expected: 562 (post-R.3.2 baseline). Target post-R.3.3: ~578 (+16 net from `group-by-date.test.ts` + `category-palette.test.ts`).

- [ ] **Read the SPEC end-to-end before T1**

[docs/redesign/r3-3-transactions/SPEC.md](SPEC.md). Section "Final component map" is the canonical inventory of new / modified / deleted files. Section "Locked decisions" governs all ambiguity calls.

- [ ] **Read the prototype bundle**

Open [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx) side-by-side throughout. It is the visual source of truth for chrome density, KPI cell proportions, date-group header typography, chip palette restraint, and freshness strip placement. Code shape is illustrative — implementation follows the operator-tier infrastructure we already shipped.

- [ ] **Read R.3.2's T5 page-rewrite + RSC boundary precedent**

[docs/redesign/r3-2-recurring/PLAN.md § T5](../r3-2-recurring/PLAN.md). Establishes the "strike-3 watch" on `'use client'` boundaries (CLAUDE.md > Lessons learned § "Don't pass functions across the server→client boundary in config props"). R.3.3 inherits this watch.

- [ ] **Read R.3.1's T7 polish-commit pattern**

[docs/redesign/r3-1-goals/PLAN.md § T7](../r3-1-goals/PLAN.md). Establishes the UAT-driven `fix(r3.x):` polish-commit convention used by T8.

- [ ] **Verify `--accent-strong`, `--semantic-caution`, and `--hairline` Foothold tokens are defined**

```bash
grep -n "\-\-accent-strong\|\-\-semantic-caution\|\-\-hairline" src/app/globals.css
```
Expected: each token resolves in both `:root` and `.dark` blocks. If `--hairline` is missing (it may be — R.3.1/R.3.2 used `--border` for hairlines), substitute `bg-[--border]` in step 1.2's category-palette structural-class mapping and update the unit test expectations accordingly. **Record what you find before writing code** — the tests in step 1.1 assert literal class-string outputs.

- [ ] **Confirm operator-tier infrastructure is intact**

```bash
grep -n "'use client'" src/components/transactions/
```
Expected matches: every file in `src/components/transactions/` EXCEPT `category-picker.tsx` (we'll add 3 server components in T2/T3 that won't carry the directive). Currently the directive lives in: `bulk-action-bar.tsx`, `filter-row.tsx`, `mobile-transactions-shell.tsx`, `operator-pagination.tsx`, `operator-shell.tsx`, `operator-table.tsx`, `transaction-detail-sheet.tsx`. The set should NOT grow in R.3.3.

---

## T1 — Pure helpers (`group-by-date.ts` + `category-palette.ts`)

**Goal:** Extract `groupTransactionsByDate` and `categoryToTokens` as pure functions with full vitest coverage. TDD-first — date math (timezone drift, day-net sign convention) and palette lookup (fall-through-to-structural rule) are both edge-prone.

**Files:**
- Create: `src/lib/transactions/group-by-date.ts`
- Create: `src/lib/transactions/group-by-date.test.ts`
- Create: `src/lib/transactions/category-palette.ts`
- Create: `src/lib/transactions/category-palette.test.ts`

**Subtasks:**

- [ ] **Step 1.1 — Write `group-by-date.test.ts` first (TDD)**

```ts
// src/lib/transactions/group-by-date.test.ts
import { describe, expect, it } from 'vitest';
import { groupTransactionsByDate } from './group-by-date';
import type { TransactionListRow } from '@/lib/db/queries/transactions';

/**
 * Helper to construct a minimal TransactionListRow for tests. Only the
 * fields that group-by-date.ts touches are required; the rest are
 * stubbed with safe defaults so the type-checker is happy.
 */
function tx(overrides: Partial<TransactionListRow>): TransactionListRow {
  return {
    id: 'stub',
    name: 'Stub Tx',
    merchantName: null,
    date: '2026-05-11',
    amount: 10,
    primaryCategory: null,
    detailedCategory: null,
    pending: false,
    paymentChannel: null,
    accountId: 'acct-stub',
    accountName: 'Stub Acct',
    accountMask: '0000',
    accountType: 'depository',
    overrideCategoryId: null,
    overrideCategoryName: null,
    ...overrides,
  };
}

describe('groupTransactionsByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupTransactionsByDate([])).toEqual([]);
  });

  it('returns one group for a single row', () => {
    const rows = [tx({ id: 'a', date: '2026-05-11', amount: 10 })];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateIso).toBe('2026-05-11');
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a']);
  });

  it('groups same-day rows together preserving input order', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 10 }),
      tx({ id: 'b', date: '2026-05-11', amount: 20 }),
      tx({ id: 'c', date: '2026-05-11', amount: 30 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('produces groups in date-desc order', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-10' }),
      tx({ id: 'b', date: '2026-05-11' }),
      tx({ id: 'c', date: '2026-05-09' }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups.map((g) => g.dateIso)).toEqual([
      '2026-05-11',
      '2026-05-10',
      '2026-05-09',
    ]);
  });

  it('sums dayNet signed across the group (Plaid sign: +out, -in)', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 50 }), // outflow
      tx({ id: 'b', date: '2026-05-11', amount: 30 }), // outflow
      tx({ id: 'c', date: '2026-05-11', amount: -10 }), // inflow
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayNet).toBeCloseTo(70, 2);
  });

  it('handles negative dayNet for income-heavy days', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: -5000 }), // big inflow
      tx({ id: 'b', date: '2026-05-11', amount: 100 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayNet).toBeCloseTo(-4900, 2);
  });

  it('emits dayName as Sun/Mon/.../Sat via UTC parsing', () => {
    // 2026-05-11 is a Monday (verified: 2026-05-10 is Sunday).
    const rows = [tx({ id: 'a', date: '2026-05-11' })];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayName).toBe('Mon');
  });

  it('parses date as UTC to avoid local-timezone drift', () => {
    // A 2026-05-11 ISO date parsed with `new Date(s)` could shift to
    // 2026-05-10 in negative-offset zones. Force-UTC parsing must
    // anchor the dayName on the calendar date, not the local clock.
    const rows = [tx({ id: 'a', date: '2026-01-01' })];
    const groups = groupTransactionsByDate(rows);
    // 2026-01-01 is a Thursday in UTC.
    expect(groups[0].dayName).toBe('Thu');
  });

  it('handles multiple days with mixed signs', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 100 }),
      tx({ id: 'b', date: '2026-05-10', amount: -200 }),
      tx({ id: 'c', date: '2026-05-10', amount: 50 }),
      tx({ id: 'd', date: '2026-05-09', amount: 25 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(3);
    expect(groups[0].dateIso).toBe('2026-05-11');
    expect(groups[0].dayNet).toBeCloseTo(100, 2);
    expect(groups[1].dateIso).toBe('2026-05-10');
    expect(groups[1].dayNet).toBeCloseTo(-150, 2);
    expect(groups[2].dateIso).toBe('2026-05-09');
    expect(groups[2].dayNet).toBeCloseTo(25, 2);
  });

  it('preserves input order even when input is unsorted', () => {
    // `getTransactions` ALWAYS returns date-desc, but we don't enforce
    // that as a precondition — same-day rows keep their input order so
    // any caller sort within a day flows through deterministically.
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 30 }),
      tx({ id: 'b', date: '2026-05-10', amount: 10 }),
      tx({ id: 'c', date: '2026-05-11', amount: 20 }), // ← out of order
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups.find((g) => g.dateIso === '2026-05-11')!.rows.map((r) => r.id)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 1.2 — Run the test, confirm it fails**

```bash
npm run test -- group-by-date 2>&1 | tail -20
```
Expected: 10 failing tests, all citing "groupTransactionsByDate is not a function" or "Cannot find module './group-by-date'".

- [ ] **Step 1.3 — Implement `group-by-date.ts`**

```ts
// src/lib/transactions/group-by-date.ts
import type { TransactionListRow } from '@/lib/db/queries/transactions';

export type DayGroup = {
  /** ISO date string `YYYY-MM-DD`. */
  dateIso: string;
  /** Abbreviated weekday name (`Sun`–`Sat`), UTC-anchored. */
  dayName: string;
  /** Signed sum of `row.amount` within the group (Plaid: +out, -in). */
  dayNet: number;
  rows: TransactionListRow[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Bucket transactions by ISO date (YYYY-MM-DD). Output is sorted by
 * date descending (newest first); within a group rows preserve input
 * order — callers handle within-day sort.
 *
 * dayName is UTC-anchored to dodge timezone drift on the boundary
 * (a 2026-05-11 ISO date parsed as local time in a negative-offset
 * zone otherwise renders as 2026-05-10's weekday).
 *
 * dayNet keeps Plaid sign convention (positive = outflow). Display
 * layer flips for rendering, same as row-level amounts.
 */
export function groupTransactionsByDate(
  rows: TransactionListRow[],
): DayGroup[] {
  const byDate = new Map<string, TransactionListRow[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date);
    if (bucket) bucket.push(row);
    else byDate.set(row.date, [row]);
  }

  const groups: DayGroup[] = [];
  for (const [dateIso, groupRows] of byDate) {
    const dayNet = groupRows.reduce((sum, r) => sum + r.amount, 0);
    groups.push({
      dateIso,
      dayName: weekdayFromIso(dateIso),
      dayNet,
      rows: groupRows,
    });
  }

  groups.sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
  return groups;
}

function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[utcDay];
}
```

- [ ] **Step 1.4 — Run the test, confirm it passes**

```bash
npm run test -- group-by-date 2>&1 | tail -10
```
Expected: 10 passing tests.

- [ ] **Step 1.5 — Write `category-palette.test.ts` first (TDD)**

```ts
// src/lib/transactions/category-palette.test.ts
import { describe, expect, it } from 'vitest';
import { categoryToTokens } from './category-palette';

const INCOME = {
  bg: 'bg-[--accent-strong]/10',
  fg: 'text-[--accent-strong]',
};
const CAUTION = {
  bg: 'bg-[--semantic-caution]/10',
  fg: 'text-[--semantic-caution]',
};
const STRUCTURAL = {
  bg: 'bg-[--hairline]',
  fg: 'text-[--text-2]',
};

describe('categoryToTokens', () => {
  it('maps income PFCs to the income class', () => {
    expect(categoryToTokens('INCOME')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_WAGES')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_DIVIDENDS')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_INTEREST_EARNED')).toEqual(INCOME);
  });

  it('maps caution PFCs to the caution class', () => {
    expect(categoryToTokens('FOOD_AND_DRINK')).toEqual(CAUTION);
    expect(categoryToTokens('FOOD_AND_DRINK_RESTAURANTS')).toEqual(CAUTION);
    expect(categoryToTokens('ENTERTAINMENT')).toEqual(CAUTION);
    expect(categoryToTokens('PERSONAL_CARE')).toEqual(CAUTION);
    expect(categoryToTokens('MEDICAL')).toEqual(CAUTION);
  });

  it('maps transfer / loan / fee PFCs to the structural class', () => {
    expect(categoryToTokens('TRANSFER_IN')).toEqual(STRUCTURAL);
    expect(categoryToTokens('TRANSFER_OUT')).toEqual(STRUCTURAL);
    expect(categoryToTokens('LOAN_PAYMENTS')).toEqual(STRUCTURAL);
    expect(categoryToTokens('BANK_FEES')).toEqual(STRUCTURAL);
  });

  it('falls through to structural for unknown PFCs', () => {
    // Plaid has ~100 PFCs; the table only enumerates income + caution.
    // Anything not matched falls through to structural rather than
    // inventing a fresh hue per category (Christmas-tree anti-pattern).
    expect(categoryToTokens('GENERAL_MERCHANDISE')).toEqual(STRUCTURAL);
    expect(categoryToTokens('TRAVEL')).toEqual(STRUCTURAL);
    expect(categoryToTokens('HOME_IMPROVEMENT')).toEqual(STRUCTURAL);
  });

  it('handles null + empty string as structural', () => {
    expect(categoryToTokens(null)).toEqual(STRUCTURAL);
    expect(categoryToTokens('')).toEqual(STRUCTURAL);
  });

  it('treats casing case-insensitively (Plaid PFCs are upper-snake but defensive)', () => {
    // PFC strings should ALWAYS arrive upper-snake from `getTransactions`,
    // but a user-override category name might land here too. Both shapes
    // should still classify correctly — income remains income.
    expect(categoryToTokens('income')).toEqual(INCOME);
    expect(categoryToTokens('Food_And_Drink')).toEqual(CAUTION);
  });
});
```

- [ ] **Step 1.6 — Run the test, confirm it fails**

```bash
npm run test -- category-palette 2>&1 | tail -20
```
Expected: 6 failing tests citing module-not-found.

- [ ] **Step 1.7 — Implement `category-palette.ts`**

```ts
// src/lib/transactions/category-palette.ts

export type CategoryTokens = {
  bg: string;
  fg: string;
};

const INCOME: CategoryTokens = {
  bg: 'bg-[--accent-strong]/10',
  fg: 'text-[--accent-strong]',
};
const CAUTION: CategoryTokens = {
  bg: 'bg-[--semantic-caution]/10',
  fg: 'text-[--semantic-caution]',
};
const STRUCTURAL: CategoryTokens = {
  bg: 'bg-[--hairline]',
  fg: 'text-[--text-2]',
};

/**
 * Plaid PFCs that resolve to the caution class. Note this is a small,
 * restrained set — adding new entries here is a design decision (the
 * "max 3-4 distinct hues visible at once" rule from SPEC § Locked
 * decisions #4 is what keeps this from drifting into Christmas-tree
 * territory). The full Plaid PFC list has ~100 entries; everything
 * else falls through to structural.
 */
const CAUTION_PFCS = new Set([
  'FOOD_AND_DRINK',
  'FOOD_AND_DRINK_RESTAURANTS',
  'FOOD_AND_DRINK_GROCERIES',
  'ENTERTAINMENT',
  'PERSONAL_CARE',
  'MEDICAL',
]);

/**
 * Map a category string (Plaid PFC or user-override name) to one of
 * three Foothold token classes. The fallthrough is intentional — when
 * in doubt, structural keeps the row visually quiet.
 *
 * Casing is normalized so user-override names like "Groceries" still
 * route via the structural class without surprises; Plaid PFCs always
 * arrive upper-snake. Income detection runs first (prefix match) since
 * it covers ~10 PFCs without enumerating each.
 */
export function categoryToTokens(category: string | null): CategoryTokens {
  if (!category) return STRUCTURAL;
  const upper = category.toUpperCase();
  if (upper === 'INCOME' || upper.startsWith('INCOME_')) return INCOME;
  if (CAUTION_PFCS.has(upper)) return CAUTION;
  return STRUCTURAL;
}
```

- [ ] **Step 1.8 — Run the test, confirm it passes**

```bash
npm run test -- category-palette 2>&1 | tail -10
```
Expected: 6 passing tests.

- [ ] **Step 1.9 — Run the full test suite + typecheck**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean. Total ≈ baseline (562) + 16 (10 group-by-date + 6 category-palette) = **578**.

- [ ] **Step 1.10 — Commit T1**

```bash
git add src/lib/transactions/group-by-date.ts \
        src/lib/transactions/group-by-date.test.ts \
        src/lib/transactions/category-palette.ts \
        src/lib/transactions/category-palette.test.ts
git commit -m "$(cat <<'EOF'
feat(r3.3): T1 pure helpers — groupTransactionsByDate + categoryToTokens

Two new pure modules under src/lib/transactions/. Both are leaf
helpers consumed by components in T3-T7; isolating + testing them
first lets every downstream task ship without re-verifying date
math or palette fall-through.

groupTransactionsByDate: bucket TransactionListRow[] by ISO date,
output sorted date-desc, dayNet signed per Plaid convention
(+out / -in), dayName UTC-anchored (avoids the timezone drift bug
where a 2026-05-11 ISO would render as the prior day's weekday in
negative-offset locales). 10 vitest cases cover the boundary set:
empty input, single row, same-day grouping, dayNet sign, multi-day
ordering, mixed-sign aggregates, UTC weekday anchoring, input-order
preservation within a day.

categoryToTokens: map a PFC or user-override category string to one
of three Foothold token classes (income / caution / structural).
INCOME / INCOME_* covered via prefix match (~10 Plaid PFCs without
enumeration). CAUTION_PFCS is a curated 6-entry Set — adding to it
is a design decision per SPEC § Locked decisions #4 (restraint
prevents Christmas-tree anti-pattern). Everything else (~80%+ of
Plaid PFCs, null, empty, unknown user labels) falls through to the
structural class. 6 vitest cases cover the income/caution sets,
the fall-through default, and casing tolerance for user labels.

+16 net vitest cases (562 → 578).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T2 — `getMonthlyTransactionTotals` query + `<TransactionsPageHeader>` + `<TransactionsSummaryStrip>`

**Goal:** New query that produces month-to-date Spend / Income / Net for the KPI strip, plus the two server-rendered chrome components that mount above the operator shell. Spend value MUST equal `getDashboardSummary.monthSpend` digit-for-digit (SPEC § Data flow load-bearing invariant).

**Files:**
- Create: `src/lib/db/queries/transaction-totals.ts`
- Create: `src/components/transactions/transactions-page-header.tsx`
- Create: `src/components/transactions/transactions-summary-strip.tsx`

**Subtasks:**

- [ ] **Step 2.1 — Implement `getMonthlyTransactionTotals`**

The dashboard's `currentMonthRange()` helper is currently private to [dashboard.ts](../../../src/lib/db/queries/dashboard.ts:19-27). Rather than exporting it (which would ripple-edit dashboard.ts under our T2 commit), duplicate the 9-line helper inline. Future cleanup: extract to `src/lib/db/queries/_shared.ts` — out of scope for R.3.3.

```ts
// src/lib/db/queries/transaction-totals.ts
import { and, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  externalItems,
  transactions,
} from '@/lib/db/schema';

export type MonthlyTransactionTotals = {
  /** Sum of outflow amounts in the current month (Plaid: amount > 0). */
  spend: number;
  /** Sum of inflow amounts in the current month, returned as positive. */
  income: number;
  /** income − spend. Positive when earning > spending this month. */
  net: number;
};

/** First/last day of the current calendar month as YYYY-MM-DD strings.
 *  Duplicated from dashboard.ts to avoid touching that file in this
 *  commit; consolidate to a shared helper if a 3rd consumer lands. */
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Month-to-date Spend / Income / Net for the /transactions KPI strip.
 * Single SQL select with CASE-aggregated SUM(...) so spend and income
 * land in one round trip.
 *
 * EXCLUSION LIST (must stay verbatim in lockstep with
 * `getDashboardSummary.monthSpend`):
 *   - financial_account.type = 'investment' excluded (investment txns
 *     don't reflect cash movement in the user's sense)
 *   - primary_category IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS')
 *     excluded (structural movements, not real spend/income)
 *   - COALESCE wraps the NOT IN so NULL categories don't filter out
 *     (NULL NOT IN (...) → NULL → falsy; we want them included)
 *
 * INVARIANT: spend MUST equal getDashboardSummary().monthSpend for the
 * same user at the same instant. T8 UAT gate 7 verifies side-by-side.
 */
export async function getMonthlyTransactionTotals(
  userId: string,
): Promise<MonthlyTransactionTotals> {
  const { start, end } = currentMonthRange();

  const [row] = await db
    .select({
      spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric > 0 THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric < 0 THEN -${transactions.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        gte(transactions.date, start),
        lt(transactions.date, end),
        notInArray(financialAccounts.type, ['investment']),
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    );

  const spend = Number(row?.spend ?? 0);
  const income = Number(row?.income ?? 0);
  return {
    spend,
    income,
    net: income - spend,
  };
}
```

- [ ] **Step 2.2 — Typecheck the query**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean. If Drizzle complains about the `CASE WHEN` raw-SQL shape, double-check the `${transactions.amount}::numeric` interpolation matches dashboard.ts:70's `sql<string>` shape — it should compile identically.

- [ ] **Step 2.3 — Create `<TransactionsPageHeader>`**

```tsx
// src/components/transactions/transactions-page-header.tsx

/**
 * /transactions page header. Mirrors <RecurringPageHeader> + <GoalsPageHeader>
 * pattern from R.3.1/R.3.2. Eyebrow "Records" + h1 "Transactions" (left)
 * + freshness meta (right). Page sub-line is rendered by page.tsx in T7
 * if needed (currently we lean on the KPI strip to do the talking).
 */
export function TransactionsPageHeader({
  freshnessHeadline,
  freshnessCaveat,
}: {
  freshnessHeadline: string;
  freshnessCaveat: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Records
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          Transactions
        </h1>
      </div>
      <div className="hidden text-right text-xs text-[--text-2] sm:block">
        <div>{freshnessHeadline}</div>
        {freshnessCaveat && (
          <div className="mt-0.5 text-[--text-3]">{freshnessCaveat}</div>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2.4 — Create `<TransactionsSummaryStrip>` (4-cell KPI)**

```tsx
// src/components/transactions/transactions-summary-strip.tsx
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

type Props = {
  /** Month-to-date sum of outflows (positive number). */
  spend: number;
  /** Month-to-date sum of inflows (positive number). */
  income: number;
  /** income − spend; signed. */
  net: number;
  /** Row count in the current filtered view. */
  showing: number;
  /** Active filter count from countActiveFilters(); 0 == unfiltered. */
  activeFilters: number;
};

/**
 * 4-cell KPI strip per SPEC § Locked decision #2:
 *   Spend / Income / Net / Showing
 *
 * Cell typography mirrors <RecurringSummaryStrip>: 10px eyebrow, 20px
 * mono numeral, 12px sub-line. Mono + tabular-nums for digit alignment
 * across cells.
 *
 * Net cell sign-codes via valueClass — positive (income > spend) reads
 * as the brand accent (text-positive); negative reads as text-destructive
 * so an over-spending month surfaces without alarming chrome.
 *
 * "Showing" sub-line follows the auto-locked decision (SPEC § Auto-locked):
 *   - "12 filters applied" when activeFilters > 0
 *   - "unfiltered" when activeFilters === 0
 * No total-count denominator (avoids a second COUNT query; for high-row
 * users the denominator was more noise than signal).
 */
export function TransactionsSummaryStrip({
  spend,
  income,
  net,
  showing,
  activeFilters,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-4">
      <Stat
        label="Spend · this month"
        value={formatCurrencyCompact(spend)}
        sub={`across ${showing.toLocaleString()} ${showing === 1 ? 'row' : 'rows'}`}
      />
      <Stat
        label="Income · this month"
        value={formatCurrencyCompact(income)}
        sub="month to date"
      />
      <Stat
        label="Net · this month"
        value={formatCurrency(net, { signed: true })}
        sub={net >= 0 ? 'earning more than spending' : 'spending more than earning'}
        valueClass={net >= 0 ? 'text-positive' : 'text-destructive'}
      />
      <Stat
        label="Showing"
        value={showing.toLocaleString()}
        sub={
          activeFilters > 0
            ? `${activeFilters} ${activeFilters === 1 ? 'filter' : 'filters'} applied`
            : 'unfiltered'
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold tabular-nums text-[--text] ${valueClass ?? ''}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[--text-3]">{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2.5 — Typecheck + lint**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean. If `formatCurrencyCompact` or `formatCurrency({signed:true})` doesn't import cleanly, check `src/lib/utils.ts` exports — both are confirmed present per CLAUDE.md § Coding conventions.

- [ ] **Step 2.6 — Commit T2**

```bash
git add src/lib/db/queries/transaction-totals.ts \
        src/components/transactions/transactions-page-header.tsx \
        src/components/transactions/transactions-summary-strip.tsx
git commit -m "$(cat <<'EOF'
feat(r3.3): T2 query + page-header + KPI strip

Three new files lay the chrome substrate for T7's page rewrite.

src/lib/db/queries/transaction-totals.ts:
  getMonthlyTransactionTotals(userId) returns {spend, income, net}.
  Single round trip via CASE-aggregated SUM. Same exclusion list as
  getDashboardSummary.monthSpend — investment-type accounts,
  TRANSFER_IN/OUT, LOAN_PAYMENTS — VERBATIM. T8 UAT gate 7 verifies
  spend = monthSpend digit-for-digit. currentMonthRange() helper
  duplicated from dashboard.ts inline (9 lines, isolates this commit
  from touching dashboard).

src/components/transactions/transactions-page-header.tsx:
  Eyebrow "Records" + h1 + right-side freshness meta. Mirrors
  <RecurringPageHeader>/<GoalsPageHeader> pattern.

src/components/transactions/transactions-summary-strip.tsx:
  4-cell KPI per SPEC § Locked decision #2: Spend / Income / Net /
  Showing. Mono numerals + tabular-nums. Net cell sign-codes via
  text-positive vs text-destructive. "Showing" sub-line per auto-
  locked decision: "N filters applied" or "unfiltered" (no
  denominator — avoids second COUNT query).

Zero new client islands in this task — both components are server-
rendered (no 'use client' directive).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T3 — `<CategoryChip>` server component

**Goal:** Single chip primitive consumed by both desktop `<OperatorTable>` (T4) and mobile `<MobileTransactionsShell>` (T6). Reads the row's category (override or PFC), maps via `categoryToTokens`, renders a small pill with `humanizeCategory` text.

**Files:**
- Create: `src/components/transactions/category-chip.tsx`

**Subtasks:**

- [ ] **Step 3.1 — Implement `<CategoryChip>`**

```tsx
// src/components/transactions/category-chip.tsx
import { categoryToTokens } from '@/lib/transactions/category-palette';
import { humanizeCategory } from '@/lib/format/category';
import { cn } from '@/lib/utils';

type Props = {
  /** Raw Plaid PFC string (e.g. "FOOD_AND_DRINK"). Null when unknown. */
  primaryCategory: string | null;
  /** User-override category name when set. */
  overrideCategoryName: string | null;
  /** Optional size variant; defaults to compact table pill. */
  size?: 'sm' | 'xs';
};

/**
 * Restrained category pill. The visible label prefers the user's
 * override; falls back to humanized PFC; ultimately em-dash.
 *
 * Token mapping is sourced from categoryToTokens, which keeps three
 * classes (income / caution / structural) by SPEC contract. The
 * override path runs the OVERRIDE NAME through categoryToTokens too —
 * a user labeling a row "Groceries" still surfaces caution semantics
 * because the lookup is case-insensitive.
 *
 * The override-styling cue (italic title hint) is owned by the
 * consuming row, not the chip — chips read the same regardless of
 * source so the scan pattern stays consistent.
 */
export function CategoryChip({
  primaryCategory,
  overrideCategoryName,
  size = 'sm',
}: Props) {
  // Choose the source for both label AND token routing. If a user
  // overrode the category, the chip describes the user's intent;
  // categoryToTokens runs against the override name so the palette
  // honors that intent (e.g. user-labeled "Groceries" → caution).
  const sourceForTokens = overrideCategoryName ?? primaryCategory;
  const { bg, fg } = categoryToTokens(sourceForTokens);

  const label = overrideCategoryName
    ? overrideCategoryName
    : primaryCategory
      ? humanizeCategory(primaryCategory)
      : '—';

  const sizeClass =
    size === 'xs'
      ? 'h-[18px] px-1.5 text-[10px]'
      : 'h-5 px-2 text-[11px]';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill font-medium tracking-tight whitespace-nowrap',
        sizeClass,
        bg,
        fg,
      )}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 3.2 — Typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 3.3 — Commit T3**

```bash
git add src/components/transactions/category-chip.tsx
git commit -m "$(cat <<'EOF'
feat(r3.3): T3 <CategoryChip> server component

Single chip primitive consumed by desktop <OperatorTable> (T4) and
mobile <MobileTransactionsShell> (T6). Reads {primaryCategory,
overrideCategoryName}; routes label through humanizeCategory; routes
tokens through categoryToTokens from T1.

Override-aware mapping: when overrideCategoryName is set, BOTH the
visible label AND the palette routing use the override name (case-
insensitive). A user-labeled "Groceries" surfaces caution semantics
the same way Plaid's FOOD_AND_DRINK_GROCERIES would — the user's
intent is the source of truth.

No 'use client' — server-rendered everywhere it lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T4 — `<OperatorTable>` date grouping + token swap + chip integration  (HIGH-RISK — j/k regression watch)

**Goal:** Refactor `<OperatorTable>` to render groups (one `<tbody>` per day, all under one `<table>` so column alignment is preserved by HTML), restyle to Foothold tokens, and mount `<CategoryChip>` per row. j/k cursor navigation MUST continue to skip group headers (they're presentational `<tr>` elements with `aria-hidden` and no data-row mapping).

**Pre-flight observation (READ before editing):**

The current `<OperatorTable>` (src/components/transactions/operator-table.tsx) uses index-based row selection — `rowRefs.current = rowRefs.current.slice(0, rows.length)` and the j/k handler in `<OperatorShell>` operates on a flat `rows[]` array via `selectedIndex`. **This is the favorable case** noted in SPEC § Risks Severity-High row: the index-into-rows model survives grouping IF we keep two things invariant:
  1. `rowRefs.current[i]` continues to hold a reference to the `i`-th row's `<tr>` element across ALL groups (flat-indexed)
  2. The scrollIntoView effect targets `rowRefs.current[selectedIndex]`, which doesn't care which `<tbody>` the element lives in — only that it's a valid DOM node

The grouping refactor does NOT alter shell-side selection math at all. The shell still owns `rows: TransactionListRow[]` (flat) and `selectedIndex: number`. The table now also accepts `groups: DayGroup[]` (presentational, for header rendering) but uses `rows` for ref allocation + render iteration via nested-map.

**Files:**
- Modify: `src/components/transactions/operator-table.tsx`

**Subtasks:**

- [ ] **Step 4.1 — Replace `<OperatorTable>` wholesale**

Open [src/components/transactions/operator-table.tsx](../../../src/components/transactions/operator-table.tsx). Replace the file with:

```tsx
'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchX } from 'lucide-react';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import type { DayGroup } from '@/lib/transactions/group-by-date';
import { cn, formatCurrency } from '@/lib/utils';
import { CategoryChip } from './category-chip';

type Props = {
  /** Flat row list — drives ref allocation + selection indexing. */
  rows: TransactionListRow[];
  /** Pre-computed groups — drives presentational rendering only. Each
   *  group's `rows` is a slice of the flat list above. */
  groups: DayGroup[];
  selectedIndex: number;
  selectedIds: Set<string>;
  onToggle: (
    id: string,
    index: number,
    opts: { range?: boolean },
  ) => void;
  onToggleAllVisible: () => void;
};

/**
 * Operator-tier transactions table. Same multi-select + j/k DOM model
 * as before — the shell owns `rows` (flat) and selection math; this
 * component renders flat rows interleaved with `MAY 11 · SUN ... -$84.27`
 * group headers from groupTransactionsByDate (T1).
 *
 * DOM SHAPE INVARIANT: one <table>, one <thead> for column titles, then
 * alternating <tbody> sections — one section per DayGroup with a
 * presentational <tr aria-hidden> header, then the day's data rows.
 * Column widths stay aligned across groups because they're owned by a
 * single <colgroup>. Headers carry NO ref + NO selection mapping — j/k
 * cursors traverse only the data rows by flat index.
 *
 * `rowIndex` is the absolute index into the shell's flat `rows[]`. We
 * derive it inside the nested map by tracking a running counter
 * (functional approach — never mutate via closure side-effect).
 */
export function OperatorTable({
  rows,
  groups,
  selectedIndex,
  selectedIds,
  onToggle,
  onToggleAllVisible,
}: Props) {
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const allChecked =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someChecked = !allChecked && rows.some((r) => selectedIds.has(r.id));

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, rows.length);
  }, [rows.length]);

  useEffect(() => {
    const el = rowRefs.current[selectedIndex];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [selectedIndex]);

  if (rows.length === 0) {
    return <NoMatchEmpty />;
  }

  // Derive each group's first absolute index by walking the groups in
  // order. groups[0] starts at 0; groups[i] starts at the previous
  // group's start + previous group's length. Computed once per render.
  const groupStartIndices: number[] = [];
  {
    let cursor = 0;
    for (const g of groups) {
      groupStartIndices.push(cursor);
      cursor += g.rows.length;
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-[--border] bg-[--surface]">
      <div className="max-h-[calc(100vh-18rem)] overflow-auto">
        <table className="w-full text-sm">
          <colgroup>
            <col className="w-[36px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[180px]" />
            <col className="w-[160px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[--surface]/95 backdrop-blur">
            <tr className="border-b border-[--border] text-[10px] uppercase tracking-[0.12em] text-[--text-3]">
              <Th>
                <SelectAllCheckbox
                  allChecked={allChecked}
                  someChecked={someChecked}
                  disabled={rows.length === 0}
                  onToggle={onToggleAllVisible}
                />
              </Th>
              <Th className="text-left">Date</Th>
              <Th className="text-left">Description</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          {groups.map((group, gi) => (
            <tbody key={group.dateIso}>
              <tr aria-hidden className="border-y border-[--border]/70 bg-[--surface-sunken]/40">
                <td colSpan={5} className="px-3 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[--text-2]">
                    {formatGroupDate(group.dateIso)}
                    <span className="mx-1.5 text-[--text-3]">·</span>
                    <span className="text-[--text-3]">{group.dayName}</span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <span
                    className={cn(
                      'font-mono text-[11px] tabular-nums',
                      group.dayNet > 0
                        ? 'text-[--text-2]'
                        : group.dayNet < 0
                          ? 'text-positive'
                          : 'text-[--text-3]',
                    )}
                  >
                    {formatCurrency(-group.dayNet, { signed: true })}
                  </span>
                </td>
              </tr>
              {group.rows.map((row, withinGroup) => {
                const absIndex = groupStartIndices[gi] + withinGroup;
                return (
                  <Row
                    key={row.id}
                    t={row}
                    index={absIndex}
                    isSelected={absIndex === selectedIndex}
                    isChecked={selectedIds.has(row.id)}
                    onToggle={onToggle}
                    rowRef={(el) => {
                      rowRefs.current[absIndex] = el;
                    }}
                  />
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <th
      className={cn('px-3 py-2 font-medium', className)}
      scope="col"
      {...rest}
    >
      {children}
    </th>
  );
}

function SelectAllCheckbox({
  allChecked,
  someChecked,
  disabled,
  onToggle,
}: {
  allChecked: boolean;
  someChecked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked;
  }, [someChecked]);

  const state = allChecked
    ? 'checked'
    : someChecked
      ? 'indeterminate'
      : 'unchecked';
  const label = allChecked
    ? 'Deselect all visible rows'
    : 'Select all visible rows';

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      disabled={disabled}
      data-state={state}
      aria-label={label}
      onChange={onToggle}
      className="h-3.5 w-3.5 cursor-pointer rounded border-[--border] text-[--text] accent-[--text] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function NoMatchEmpty() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hasFilters = params.size > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-[--border] bg-[--surface] px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-pill bg-[--surface-sunken] text-[--text-2]">
        <SearchX className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium text-[--text]">No transactions match</p>
        <p className="text-sm text-[--text-2]">
          {hasFilters
            ? 'Try widening the date range, switching the account, or clearing the search.'
            : 'No transactions have synced yet — try Sync now from the top bar.'}
        </p>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs font-medium text-[--text-2] underline-offset-4 hover:underline"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function Row({
  t,
  index,
  isSelected,
  isChecked,
  onToggle,
  rowRef,
}: {
  t: TransactionListRow;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  onToggle: (
    id: string,
    index: number,
    opts: { range?: boolean },
  ) => void;
  rowRef: (el: HTMLTableRowElement | null) => void;
}) {
  // Plaid sign convention: positive = money OUT. Flip for display.
  const display = -t.amount;
  const isIncome = display > 0;

  function handleCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    onToggle(t.id, index, { range: e.shiftKey });
  }

  return (
    <tr
      ref={rowRef}
      aria-selected={isSelected}
      data-checked={isChecked}
      className={cn(
        'group border-b border-[--border]/60 transition-colors duration-fast ease-out-quart last:border-b-0',
        isChecked
          ? 'bg-[--accent]/20 hover:bg-[--accent]/30'
          : isSelected
            ? 'bg-[--surface-sunken]'
            : 'hover:bg-[--surface-sunken]/60',
      )}
    >
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          checked={isChecked}
          aria-label={`Select transaction ${t.merchantName ?? t.name}`}
          onClick={handleCheckboxClick}
          onChange={() => undefined}
          className={cn(
            'h-3.5 w-3.5 cursor-pointer rounded border-[--border] text-[--text] accent-[--text]',
            'opacity-0 group-hover:opacity-100 group-data-[checked=true]:opacity-100 focus-visible:opacity-100',
          )}
        />
      </td>
      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-[--text-3] whitespace-nowrap">
        {formatRowDate(t.date)}
      </td>
      <td className="max-w-0 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[--text]">
            {t.merchantName ?? t.name}
          </span>
          {t.pending && (
            <span className="shrink-0 rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[--text-3]">
              pending
            </span>
          )}
        </div>
        {t.merchantName && t.merchantName !== t.name && (
          <p className="truncate text-xs text-[--text-3]">{t.name}</p>
        )}
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        <CategoryChip
          primaryCategory={t.primaryCategory}
          overrideCategoryName={t.overrideCategoryName}
        />
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-[--text-2]">
        {t.accountName}
        {t.accountMask && (
          <span className="text-[--text-3]"> ····{t.accountMask}</span>
        )}
      </td>
      <td
        className={cn(
          'px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap',
          isIncome ? 'text-positive' : 'text-[--text]',
        )}
      >
        {formatCurrency(display, { signed: true })}
      </td>
    </tr>
  );
}

function formatRowDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function formatGroupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 4.2 — Verify the row-index invariant by tracing**

Walk through the render mentally with a 5-row, 3-group input:
- Group 0 (May 11): rows[0], rows[1] → absIndex 0, 1; rowRefs.current[0], rowRefs.current[1]
- Group 1 (May 10): rows[2] → absIndex 2; rowRefs.current[2]
- Group 2 (May 9): rows[3], rows[4] → absIndex 3, 4; rowRefs.current[3], rowRefs.current[4]

`groupStartIndices` = [0, 2, 3]. `groupStartIndices[gi] + withinGroup` produces the absolute index. j/k arithmetic in shell still moves `selectedIndex` by ±1 against `rows.length = 5`. ScrollIntoView targets `rowRefs.current[selectedIndex]` — DOM node in whichever `<tbody>`. **No regression possible** when the math is correct.

If you cannot convince yourself this is right, dispatch the systematic-debugging skill before continuing.

- [ ] **Step 4.3 — Typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean. The `groups` prop addition will fail in `<OperatorShell>` since the shell doesn't pass it yet — that gets wired in T5 step 5.1.

- [ ] **Step 4.4 — Defer dev render until shell is wired**

The page won't render cleanly until T5 wires `groups` through. Skip the dev-render sanity check here; T5 includes one explicitly.

- [ ] **Step 4.5 — Commit T4**

```bash
git add src/components/transactions/operator-table.tsx
git commit -m "$(cat <<'EOF'
feat(r3.3): T4 <OperatorTable> date grouping + token swap + chips

DOM SHAPE CHANGE: flat <tbody> → per-group <tbody> sections within
one <table>. Column alignment preserved by a single <colgroup>; date
headers are presentational <tr aria-hidden> rows that DO NOT carry
refs or selection mapping.

j/k navigation invariant preserved: shell still owns flat rows[] +
selectedIndex (number); rowRefs is a flat array indexed by absolute
position; groupStartIndices[gi] + withinGroup produces the absolute
index inside the nested map. Headers are skipped by construction
(no ref allocation, no selection slot).

Foothold token swap:
  - bg-surface-elevated → bg-[--surface]
  - bg-surface-sunken → bg-[--surface-sunken]
  - text-muted-foreground → text-[--text-2] / text-[--text-3]
  - border-border → border-[--border]
  - accent class on selected row → bg-[--accent]/20

Inline italic-PFC category cell deleted in favor of <CategoryChip>
(T3) — single source of truth for category palette + label.

Group header: MAY 11 · SUN ... -$84.27, day-net signed correctly
(income-heavy days show negative dayNet, rendered as positive
inflow via display flip). UTC-anchored date formatting.

Page won't render cleanly until T5 wires the new `groups` prop in
the shell — typecheck will pass but `<OperatorShell>` invocation
in page.tsx still passes the old prop set. Resolved in T5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T5 — `<OperatorShell>` + `<FilterRow>` + `<BulkActionBar>` + `<OperatorPagination>` token-swap + groups plumbing

**Goal:** Restyle the four desktop-only client components to Foothold tokens. Wire `groups` prop through `<OperatorShell>` → `<OperatorTable>`. Selection state + keyboard handlers UNCHANGED — touching only chrome classes.

**Files:**
- Modify: `src/components/transactions/operator-shell.tsx`
- Modify: `src/components/transactions/filter-row.tsx`
- Modify: `src/components/transactions/bulk-action-bar.tsx`
- Modify: `src/components/transactions/operator-pagination.tsx`

**Subtasks:**

- [ ] **Step 5.1 — Restyle `<OperatorShell>` + wire `groups` prop**

Open [src/components/transactions/operator-shell.tsx](../../../src/components/transactions/operator-shell.tsx). Two edits:
  1. Add `groups: DayGroup[]` to `Props`
  2. Forward `groups` to `<OperatorTable>`

```tsx
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CategoryOption } from '@/lib/db/queries/categories';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import type { DayGroup } from '@/lib/transactions/group-by-date';
import { BulkActionBar } from './bulk-action-bar';
import { FilterRow, SEARCH_INPUT_ID } from './filter-row';
import { OperatorPagination } from './operator-pagination';
import { OperatorTable } from './operator-table';

type Props = {
  rows: TransactionListRow[];
  groups: DayGroup[];
  accounts: AccountOption[];
  categories: string[];
  categoryOptions: CategoryOption[];
  page: number;
  totalPages: number;
  totalCount: number;
};

export function OperatorShell({
  rows,
  groups,
  accounts,
  categories,
  categoryOptions,
  page,
  totalPages,
  totalCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState(rows.length > 0 ? 0 : -1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<number | null>(null);

  useEffect(() => {
    setSelectedIndex(rows.length > 0 ? 0 : -1);
    setSelectedIds(new Set());
    lastClickedRef.current = null;
  }, [rows]);

  const goToPage = useCallback(
    (target: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (target <= 1) next.delete('page');
      else next.set('page', String(target));
      router.push(next.size ? `${pathname}?${next}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const onToggle = useCallback(
    (id: string, index: number, opts: { range?: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (opts.range && lastClickedRef.current != null) {
          const lo = Math.min(lastClickedRef.current, index);
          const hi = Math.max(lastClickedRef.current, index);
          for (let i = lo; i <= hi; i++) {
            next.add(rows[i].id);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        lastClickedRef.current = index;
        return next;
      });
    },
    [rows],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedRef.current = null;
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const allChecked =
        rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allChecked) {
        lastClickedRef.current = null;
        return new Set();
      }
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
        if (page < totalPages) {
          e.preventDefault();
          goToPage(page + 1);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
        if (page > 1) {
          e.preventDefault();
          goToPage(page - 1);
        }
        return;
      }

      if (shouldIgnore(e)) return;

      if (e.key === 'Escape' && selectedIds.size > 0) {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(rows.length - 1, i + 1));
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    clearSelection,
    goToPage,
    page,
    rows.length,
    selectedIds.size,
    totalPages,
  ]);

  return (
    <div className="space-y-4">
      <FilterRow accounts={accounts} categories={categories} />
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onClear={clearSelection}
        categoryOptions={categoryOptions}
        rows={rows}
      />
      <OperatorTable
        rows={rows}
        groups={groups}
        selectedIndex={selectedIndex}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onToggleAllVisible={toggleAllVisible}
      />
      <OperatorPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPage={goToPage}
      />
    </div>
  );
}
```

The body changes from the existing shell are exactly two: the import of `DayGroup`, and the `groups` prop forwarded to `<OperatorTable>`. Selection math + keyboard handlers MUST remain untouched — any other edit here is out of scope for R.3.3.

- [ ] **Step 5.2 — Restyle `<FilterRow>` (token swap)**

Open [src/components/transactions/filter-row.tsx](../../../src/components/transactions/filter-row.tsx). Replace `CHIP_BASE`:

```tsx
const CHIP_BASE = cn(
  'inline-flex h-9 items-center rounded-pill border border-[--border] bg-[--surface] px-3 text-sm text-[--text]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  'transition-colors duration-fast ease-out-quart',
);
```

Then sweep the file for the following token mappings and apply each:
- `bg-surface-elevated` → `bg-[--surface]`
- `text-muted-foreground` → `text-[--text-2]` (or `text-[--text-3]` when used as a placeholder color)
- `border-border` → `border-[--border]`
- Search input `font-mono placeholder:font-sans placeholder:text-muted-foreground` → `font-mono placeholder:font-sans placeholder:text-[--text-3]`
- Clear button trailing `hover:text-foreground` → `hover:text-[--text]`

`rounded-card` (search input wrapper) stays `rounded-pill` per chip semantics — the prototype's filter chips are pill-shaped.

Selection / debounce / URL-push logic UNTOUCHED.

- [ ] **Step 5.3 — Restyle `<BulkActionBar>` (token swap)**

Open [src/components/transactions/bulk-action-bar.tsx](../../../src/components/transactions/bulk-action-bar.tsx). Sticky-bar chrome edits:

Find the `return (` block's outer `<div>` and swap:
```tsx
className="sticky top-14 z-20 -mx-4 mb-1 flex items-center gap-3 border-b border-[--border] bg-[--surface]/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8"
```

Selection-count `<span>`:
```tsx
<span className="font-mono text-xs tabular-nums text-[--text]">
  {selectedCount.toLocaleString()} selected
</span>
```

Vertical divider:
```tsx
<span className="h-4 w-px bg-[--border]" />
```

Clear button:
```tsx
className="ml-auto inline-flex items-center gap-1 rounded-card px-2 py-1 text-xs text-[--text-2] transition-colors duration-fast ease-out-quart hover:text-[--text] disabled:opacity-60"
```

`startTransition`, `applyCategory`, `undoBulk`, sonner toasts, `c`-key handler — ALL UNTOUCHED. Touch chrome only.

- [ ] **Step 5.4 — Restyle `<OperatorPagination>` (token swap)**

Open [src/components/transactions/operator-pagination.tsx](../../../src/components/transactions/operator-pagination.tsx). Token mappings:
- `<p className="text-xs text-muted-foreground tabular-nums">` → `<p className="text-xs text-[--text-2] tabular-nums">`
- Both `<Button variant="outline" size="sm">` retained — shadcn `outline` variant already routes through Foothold tokens via `tailwind.config.ts`. No change needed.
- The kbd hint `<span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">⌘↑ / ⌘↓</span>` → `<span className="hidden font-mono text-[11px] text-[--text-3] sm:inline">⌘↑ / ⌘↓</span>`

- [ ] **Step 5.5 — Typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 5.6 — Defer dev render to T7**

Page won't fully render cleanly until T7 wires the new page-level prop set. Skip dev sanity check.

- [ ] **Step 5.7 — Commit T5**

```bash
git add src/components/transactions/operator-shell.tsx \
        src/components/transactions/filter-row.tsx \
        src/components/transactions/bulk-action-bar.tsx \
        src/components/transactions/operator-pagination.tsx
git commit -m "$(cat <<'EOF'
feat(r3.3): T5 desktop shell quartet — token swap + groups plumbing

Four desktop-only client components restyled to Foothold tokens.
ZERO behavior changes — touched chrome classes only:
  - bg-surface-elevated → bg-[--surface]
  - text-muted-foreground → text-[--text-2] / text-[--text-3]
  - border-border → border-[--border]

OperatorShell carries one additional NON-cosmetic edit: adds
`groups: DayGroup[]` to Props and forwards it to OperatorTable.
Selection state, keyboard handlers, range-select shift-click,
escape-clear, and "/" focus all UNCHANGED.

FilterRow CHIP_BASE swapped to pill-shaped border-[--border] chips
per prototype. Debounced search + URL-driven filter selects
UNCHANGED.

BulkActionBar sticky-bar chrome swapped; sonner-with-undo flow +
`c`-key picker shortcut + transition-managed apply UNCHANGED. Strike-
2 watch: NEVER touched applyCategory / undoBulk / startTransition
during the restyle (per R.3.2 § Risks "Bulk re-cat regressions
from token-swap restyle").

OperatorPagination unchanged structurally; shadcn outline Button
already routes through Foothold tokens via tailwind.config.

Page won't fully render until T7 wires the page-level Promise.all.
Typecheck clean; tests pass (no test surface in this commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T6 — `<MobileTransactionsShell>` + `<TransactionDetailSheet>` token-swap + mobile date grouping

**Goal:** Restyle the two mobile-only client components to Foothold tokens. Replace `<MobileList>` row rendering with our own grouped-section rendering driven by `groupTransactionsByDate` so desktop + mobile share one source of truth for daily-rhythm framing.

**Files:**
- Modify: `src/components/transactions/mobile-transactions-shell.tsx`
- Modify: `src/components/transactions/transaction-detail-sheet.tsx`

**Subtasks:**

- [ ] **Step 6.1 — Replace `<MobileTransactionsShell>` wholesale**

Open [src/components/transactions/mobile-transactions-shell.tsx](../../../src/components/transactions/mobile-transactions-shell.tsx). Replace the file with:

```tsx
'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { CategoryOption } from '@/lib/db/queries/categories';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';
import { loadMoreTransactionsAction } from '@/lib/transactions/actions';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileFilterSheet } from '@/components/operator/mobile-filter-sheet';
import { CategoryChip } from './category-chip';
import { TransactionDetailSheet } from './transaction-detail-sheet';

/**
 * Mobile-only shell for /transactions. Pairs with <OperatorShell>
 * (desktop) under a CSS swap on the page. Owns:
 *
 *  - Search input (debounced URL push), Filters button (active count)
 *  - Date-grouped row rendering via groupTransactionsByDate (T1) —
 *    same source of truth as desktop. Group re-computation runs on
 *    every render of allRows so appended pages merge cleanly into
 *    the existing groups (rather than re-grouping just the appended
 *    chunk, which would visually duplicate group headers at page
 *    boundaries).
 *  - <TransactionDetailSheet> half-sheet edit on row tap
 *  - Infinite scroll: IntersectionObserver sentinel triggers
 *    loadMoreTransactionsAction; appended rows live in local state.
 *
 * Reset of appended rows happens whenever initialRows changes (route
 * navigation refreshes the SSR render under the same filter), so
 * re-categorize → router.refresh() doesn't leave stale appended rows.
 */
export function MobileTransactionsShell({
  initialRows,
  accounts,
  categories,
  categoryOptions,
  initialPage,
  totalPages,
  totalCount,
  filters,
}: {
  initialRows: TransactionListRow[];
  accounts: AccountOption[];
  categories: string[];
  categoryOptions: CategoryOption[];
  initialPage: number;
  totalPages: number;
  totalCount: number;
  filters: {
    accountId?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const [appended, setAppended] = useState<TransactionListRow[]>([]);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [hasMore, setHasMore] = useState(initialPage < totalPages);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<TransactionListRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAppended([]);
    setNextPage(initialPage + 1);
    setHasMore(initialPage < totalPages);
  }, [initialRows, initialPage, totalPages]);

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search) next.set('q', search);
      else next.delete('q');
      next.delete('page');
      startTransition(() => {
        router.push(next.size ? `${pathname}?${next}` : pathname);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await loadMoreTransactionsAction(filters, nextPage);
      setAppended((prev) => [...prev, ...result.rows]);
      setNextPage((p) => p + 1);
      setHasMore(result.hasMore);
    } catch {
      // Silent: sentinel will retry on next intersection.
    } finally {
      setLoading(false);
    }
  }, [filters, hasMore, loading, nextPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { rootMargin: '300px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const allRows = useMemo(
    () => (appended.length === 0 ? initialRows : [...initialRows, ...appended]),
    [initialRows, appended],
  );
  const groups = useMemo(() => groupTransactionsByDate(allRows), [allRows]);

  return (
    <div className="space-y-3 md:hidden">
      <div className="sticky top-14 z-10 -mx-4 flex items-center gap-2 border-b border-[--border] bg-[--surface]/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--text-3]"
          />
          <input
            type="search"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-pill border border-[--border] bg-[--surface] pl-9 pr-3 font-mono text-sm text-[--text] placeholder:font-sans placeholder:text-[--text-3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <MobileFilterSheet accounts={accounts} categories={categories} />
      </div>

      <p className="px-1 text-xs text-[--text-3]">
        {totalCount.toLocaleString()}{' '}
        {totalCount === 1 ? 'transaction' : 'transactions'}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-card border border-[--border] bg-[--surface] px-4 py-12 text-center text-sm text-[--text-2]">
          {params.size > 0
            ? 'No transactions match these filters.'
            : 'No transactions synced yet.'}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.dateIso} className="space-y-1.5">
              <header className="flex items-baseline justify-between px-1">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[--text-2]">
                    {formatMobileGroupDate(group.dateIso)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-[--text-3]">
                    · {group.dayName}
                  </span>
                </div>
                <span
                  className={cn(
                    'font-mono text-[11px] tabular-nums',
                    group.dayNet > 0
                      ? 'text-[--text-2]'
                      : group.dayNet < 0
                        ? 'text-positive'
                        : 'text-[--text-3]',
                  )}
                >
                  {formatCurrency(-group.dayNet, { signed: true })}
                </span>
              </header>
              <ul className="overflow-hidden rounded-card border border-[--border] bg-[--surface]">
                {group.rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setActive(r)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-[--surface-sunken]/60"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[--text]">
                            {r.merchantName ?? r.name}
                          </span>
                          {r.pending && (
                            <span className="shrink-0 rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[--text-3]">
                              pending
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-[--text-3]">
                          <CategoryChip
                            primaryCategory={r.primaryCategory}
                            overrideCategoryName={r.overrideCategoryName}
                            size="xs"
                          />
                          <span>·</span>
                          <span className="truncate">{r.accountName}</span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-sm tabular-nums',
                          -r.amount > 0 ? 'text-positive' : 'text-[--text]',
                        )}
                      >
                        {formatCurrency(-r.amount, { signed: true })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden
          className="h-12 w-full"
        />
      )}
      {loading && (
        <p className="py-2 text-center text-xs text-[--text-3]">
          Loading more…
        </p>
      )}
      {!hasMore && groups.length > 0 && (
        <p className="py-3 text-center text-[11px] uppercase tracking-[0.12em] text-[--text-3]/80">
          End of list
        </p>
      )}

      <TransactionDetailSheet
        row={active}
        categoryOptions={categoryOptions}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

function formatMobileGroupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

Note: this swaps OFF the generic `<MobileList>` component to render groups inline. SPEC § Auto-locked decision adopted mobile grouping explicitly, and the generic `<MobileList>` doesn't support our group-header chrome (date label + day-net) without growing its config surface. Keeping the grouping logic inline here is the smallest viable change.

- [ ] **Step 6.2 — Confirm `<MobileList>` is still used elsewhere**

```bash
grep -rn "MobileList" src/components/ src/app/ | grep -v "transactions/"
```
Expected: `<MobileList>` still consumed by /drift, /investments, /transactions/<other-pages-if-any>. We're only removing one consumer; do NOT delete the component.

- [ ] **Step 6.3 — Restyle `<TransactionDetailSheet>` (token swap)**

Open [src/components/transactions/transaction-detail-sheet.tsx](../../../src/components/transactions/transaction-detail-sheet.tsx). Token mappings:

`<Drawer.Overlay>`:
```tsx
className="fixed inset-0 z-40 bg-[--text]/40 backdrop-blur-[2px]"
```

`<Drawer.Content>` cn block:
```tsx
className={cn(
  'fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col',
  'rounded-t-card border-t border-[--border] bg-[--surface]',
  'pb-[env(safe-area-inset-bottom)]',
  'outline-none',
)}
```

Drag handle:
```tsx
<div
  aria-hidden
  className="mx-auto mt-2 h-1 w-10 rounded-full bg-[--text-3]/40"
/>
```

Header `<Drawer.Title>` text classes:
```tsx
<Drawer.Title className="truncate text-base font-semibold text-[--text]">
  {row.merchantName ?? row.name}
</Drawer.Title>
<p className="mt-0.5 truncate text-xs text-[--text-2]">
  {formatLong(row.date)}
  <span aria-hidden> · </span>
  {row.accountName}
  {row.accountMask && (
    <span className="text-[--text-3]">
      {' ····'}
      {row.accountMask}
    </span>
  )}
</p>
```

Amount block:
```tsx
<p
  className={cn(
    'font-mono text-3xl font-semibold tabular-nums',
    isIncome ? 'text-positive' : 'text-[--text]',
  )}
>
  {formatCurrency(display, { signed: true })}
</p>
{row.pending && (
  <span className="mt-1 inline-flex rounded-md bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[--text-3]">
    pending
  </span>
)}
```

Category section: swap `text-muted-foreground` → `text-[--text-2]`, `text-eyebrow` retained (already a Foothold utility per CLAUDE.md).

`<CategoryOptionRow>` body className:
```tsx
className={cn(
  'flex min-h-[44px] items-center justify-between gap-2 rounded-card px-3 py-2 text-left text-sm transition-colors duration-fast ease-out-quart',
  muted
    ? 'text-[--text-2] hover:bg-[--surface-sunken]'
    : 'text-[--text] hover:bg-[--surface-sunken]',
  'disabled:cursor-not-allowed disabled:opacity-60',
)}
```

`<Check className="h-4 w-4 text-foreground" />` → `<Check className="h-4 w-4 text-[--text]" />`

Re-categorize action flow + sonner + Undo affordance — ALL UNTOUCHED.

- [ ] **Step 6.4 — Typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 6.5 — Commit T6**

```bash
git add src/components/transactions/mobile-transactions-shell.tsx \
        src/components/transactions/transaction-detail-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(r3.3): T6 mobile shell — date grouping + token swap

MobileTransactionsShell:
  - SPEC § Auto-locked: adopt mobile date grouping for parity with
    desktop. groupTransactionsByDate runs on every render of allRows
    (memoized) so appended pages merge cleanly into existing groups
    without duplicate headers at page boundaries.
  - Swapped OFF the generic <MobileList> component — its config-prop
    surface doesn't naturally express group-header chrome (date
    label + day-net total). Inline section/ul rendering is the
    smallest viable shape. <MobileList> still in use by /drift,
    /investments, and elsewhere; do NOT delete it.
  - CategoryChip (T3) replaces inline category text in the row's
    secondary line. size="xs" variant tuned for mobile density.
  - Foothold tokens throughout: bg-[--surface], text-[--text*],
    border-[--border], etc.
  - Infinite scroll behavior + search-debounce-to-URL UNCHANGED.

TransactionDetailSheet:
  - Token swap on drawer overlay, content, handle, header, amount
    block, category section, option rows.
  - Re-categorize action + sonner-with-undo flow UNCHANGED.

Strike-3 watch: no new 'use client' boundaries; no new config-of-
functions props crossing RSC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T7 — Page rewrite + `revalidatePath` verification

**Goal:** Wholesale rewrite of `/transactions/page.tsx` to mount everything T1-T6 produced under the new chrome (header + KPI strip + filter row + table/shell + pagination). Adds two new queries to the Promise.all. Verifies `revalidatePath('/transactions')` is wired on sync actions per SPEC § Risks low-severity row.

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`

**Subtasks:**

- [ ] **Step 7.1 — Verify `revalidatePath('/transactions')` exists on sync action paths**

```bash
grep -rn "revalidatePath" src/lib/sync/ src/lib/plaid/ src/lib/snaptrade/ 2>&1 | head -20
```

Expected: at minimum the following revalidations exist after the R.3.2 T5 fixup:
- `syncItemAction`: `revalidatePath('/settings')`, `revalidatePath('/dashboard')`, `revalidatePath('/recurring')` — and we ADD `/transactions` here in step 7.2 if missing
- `syncAllItemsAction`: same set

If `/transactions` is NOT in either list, add it. R.3.2 fixed `syncAllItemsAction` (commit 89a4c69 per SPEC) but the `/transactions` revalidatePath may still be only via `updateTransactionCategoriesAction` (bulk re-categorize), not via sync. Confirm with:

```bash
grep -rn "revalidatePath.*transactions" src/lib/ src/app/
```

Expected matches:
- `src/lib/transactions/actions.ts` (already wired for bulk re-cat)
- `src/lib/sync/actions.ts` — if missing here, that's the gap.

- [ ] **Step 7.2 — Patch sync actions if needed**

If `/transactions` was missing from sync revalidation, open [src/lib/sync/actions.ts](../../../src/lib/sync/actions.ts) and add it to the revalidatePath sweep in BOTH `syncItemAction` AND `syncAllItemsAction`. Format mirrors the existing block:

```ts
revalidatePath('/settings');
revalidatePath('/dashboard');
revalidatePath('/recurring');
revalidatePath('/transactions');
```

If `/transactions` was already present, skip this step.

- [ ] **Step 7.3 — Rewrite `/transactions/page.tsx`**

Open [src/app/(app)/transactions/page.tsx](../../../src/app/(app)/transactions/page.tsx). Replace the entire file with:

```tsx
import Link from 'next/link';
import { ArrowRight, Receipt } from 'lucide-react';
import { auth } from '@/auth';
import { MobileTransactionsShell } from '@/components/transactions/mobile-transactions-shell';
import { OperatorShell } from '@/components/transactions/operator-shell';
import { TransactionsPageHeader } from '@/components/transactions/transactions-page-header';
import { TransactionsSummaryStrip } from '@/components/transactions/transactions-summary-strip';
import { Button } from '@/components/ui/button';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import { getSourceHealth } from '@/lib/db/queries/health';
import { getMonthlyTransactionTotals } from '@/lib/db/queries/transaction-totals';
import {
  getDistinctCategories,
  getTransactions,
  getUserAccounts,
} from '@/lib/db/queries/transactions';
import { formatFreshness } from '@/lib/format/freshness';
import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';

type SearchParams = {
  page?: string;
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
};

/**
 * Count of active query-string filters. Drives the "Showing X · N
 * filters applied" sub-line on the KPI strip's Showing cell. `page`
 * is excluded because pagination isn't a filter.
 */
function countActiveFilters(p: SearchParams): number {
  let n = 0;
  if (p.account) n++;
  if (p.category) n++;
  if (p.from) n++;
  if (p.to) n++;
  if (p.q) n++;
  return n;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const page = Math.max(1, Number(searchParams.page) || 1);

  const [accounts, categories, categoryOptions, list, totals, sourceHealth] =
    await Promise.all([
      getUserAccounts(session.user.id),
      getDistinctCategories(session.user.id),
      getCategoryOptions(session.user.id),
      getTransactions(session.user.id, {
        page,
        accountId: searchParams.account,
        category: searchParams.category,
        dateFrom: searchParams.from,
        dateTo: searchParams.to,
        search: searchParams.q,
      }),
      getMonthlyTransactionTotals(session.user.id),
      getSourceHealth(session.user.id),
    ]);

  if (accounts.length === 0) {
    return <EmptyState />;
  }

  const today = new Date();
  const groups = groupTransactionsByDate(list.rows);
  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
    now: today,
  });
  const activeFilters = countActiveFilters(searchParams);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <TransactionsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <TransactionsSummaryStrip
        spend={totals.spend}
        income={totals.income}
        net={totals.net}
        showing={list.rows.length}
        activeFilters={activeFilters}
      />

      <div className="hidden md:block">
        <OperatorShell
          rows={list.rows}
          groups={groups}
          accounts={accounts}
          categories={categories}
          categoryOptions={categoryOptions}
          page={list.page}
          totalPages={list.totalPages}
          totalCount={list.totalCount}
        />
      </div>

      <MobileTransactionsShell
        initialRows={list.rows}
        accounts={accounts}
        categories={categories}
        categoryOptions={categoryOptions}
        initialPage={list.page}
        totalPages={list.totalPages}
        totalCount={list.totalCount}
        filters={{
          accountId: searchParams.account,
          category: searchParams.category,
          dateFrom: searchParams.from,
          dateTo: searchParams.to,
          search: searchParams.q,
        }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-[--surface] text-[--text-2]">
          <Receipt className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[--text]">
            No accounts connected yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
            Once you link a bank or credit card via Plaid, transactions
            sync automatically and surface here within minutes.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect an account
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Note on `showing`: the SPEC § IA shows the Showing cell value as the row count in the CURRENT FILTERED VIEW (typed as page-sized `list.rows.length`). This intentionally collapses to per-page count rather than `list.totalCount` to avoid disagreement with what's literally on screen — operators scroll past 50 rows, see "Showing 50 · 12 filters applied," and know they're paging through a filtered subset. If T8 UAT calls for `list.totalCount` instead, swap to `showing={list.totalCount}` in this file — pure presentation, no other layer impact.

- [ ] **Step 7.4 — Typecheck**

```bash
npm run typecheck 2>&1 | tail -5
```
Expected: clean. If there's a missing-prop error on `<OperatorShell>` not receiving `groups`, double-check T5 step 5.1 is committed correctly.

- [ ] **Step 7.5 — RSC boundary grep**

```bash
grep -rn "'use client'" src/components/transactions/
```
Expected matches: bulk-action-bar.tsx, filter-row.tsx, mobile-transactions-shell.tsx, operator-pagination.tsx, operator-shell.tsx, operator-table.tsx, transaction-detail-sheet.tsx, category-picker.tsx.
**Set MUST NOT include**: category-chip.tsx, transactions-page-header.tsx, transactions-summary-strip.tsx — those are server-only.

If any of the three new components carry `'use client'` accidentally, remove it before commit.

- [ ] **Step 7.6 — Run the full test suite**

```bash
npm run test 2>&1 | tail -5
```
Expected: 578 passing (562 baseline + 16 from T1).

- [ ] **Step 7.7 — Dev render sanity check**

Start dev in a separate terminal:
```bash
npm run dev
```

Visit http://localhost:3000/transactions. Verify (don't fix anything found here — real UAT is T8):
- Page boots without console errors
- Header reads "RECORDS · Transactions · Synced Xm ago"
- KPI strip shows 4 cells with monetary values
- Filter row renders below KPI strip
- Desktop table renders with `MAY 11 · MON ... -$XX.XX` group headers
- Mobile (resize browser to <md) renders the same grouping shape
- j key advances row cursor; row count works across groups
- ⌘K palette opens

If the page errors instead of rendering, trace immediately — likely a typecheck-passing-but-runtime-failing RSC boundary (strike-3 watch from CLAUDE.md > Lessons learned § 2026-05-07 "config of functions across RSC"). Trap before commit.

- [ ] **Step 7.8 — Commit T7**

```bash
git add "src/app/(app)/transactions/page.tsx"
# Add sync/actions.ts only if step 7.2 patched it:
git add src/lib/sync/actions.ts 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(r3.3): T7 page rewrite + revalidatePath

Wholesale /transactions/page.tsx rewrite assembling T2-T6 components
into the locked IA. Six-call Promise.all (getUserAccounts,
getDistinctCategories, getCategoryOptions, getTransactions,
getMonthlyTransactionTotals, getSourceHealth) feeds page-level
synchronous derivations:
  - groups = groupTransactionsByDate(list.rows)
  - freshness = formatFreshness({sources: sourceHealth.map(...)})
  - activeFilters = countActiveFilters(searchParams)

Page chrome stack (top to bottom):
  <TransactionsPageHeader> — eyebrow + h1 + freshness meta
  <TransactionsSummaryStrip> — Spend / Income / Net / Showing
  <OperatorShell rows groups ...> (desktop, hidden <md)
  <MobileTransactionsShell> (mobile, hidden md+)

revalidatePath('/transactions') verified wired on syncItemAction +
syncAllItemsAction prior to commit (gate from SPEC § Risks). Bulk
re-categorize was already wired via updateTransactionCategoriesAction.

Empty-state copy unchanged. Header eyebrow "Records" matches
nav-routes.ts:47-49 (sidebar source of truth).

RSC boundary grep verified: only 8 'use client' files in
src/components/transactions/ (the operator-tier set); the 3 new
server components carry no directive.

Test count: 578/578.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T8 — UAT polish reservation

**Goal:** Reserved fixup commits surfaced during the post-T7 UAT pass. Walks SPEC § UAT criteria, especially the High-risk gates (j/k stress test, KPI parity, mobile date grouping, RSC boundary). Each finding gets its own commit.

**Process:**

- [ ] **Step 8.1 — Run full UAT pass against SPEC § UAT criteria**

Walk every checkbox in [SPEC.md § UAT criteria](SPEC.md#uat-criteria) in this order (highest-risk first):

**Gate 10 — j/k stress test (HIGH RISK)**

Start dev server, sign in, visit /transactions. With ≥30 rows visible across ≥3 day groups:
1. Press `j` 30 times consecutively. Cursor should advance row-by-row without sticking on group headers, without skipping rows, without double-stepping.
2. Press `k` 30 times consecutively. Same expectations in reverse.
3. Press `⌘↓`. Should move to next page; cursor lands on row 0 of the new page.
4. Press `⌘↑`. Should move back; cursor lands on row 0 of prior page.
5. Press `/`. Search input focuses; type "starbucks"; debounce-fires; URL updates; new result set's cursor resets to 0.

Any deviation here is a HIGH-priority `fix(r3.3):` commit. Trace the absolute-index math in `<OperatorTable>` step 4.1 first.

**Gate 7 — KPI parity (HIGH PRIORITY)**

Open `/dashboard` and `/transactions` side-by-side in two tabs:
- `getDashboardSummary().monthSpend` ($XXX.XX on the dashboard's spend card)
- `getMonthlyTransactionTotals().spend` (the Spend cell on the KPI strip)

**MUST match digit-for-digit.** Any divergence means the exclusion list drifted between T2's `getMonthlyTransactionTotals` and dashboard.ts. Compare the WHERE clauses character-for-character.

**Gate 11 — Mobile date grouping after infinite scroll**

On mobile breakpoint (DevTools responsive mode at 375px):
1. Load /transactions. Scroll past the initial 50 rows.
2. Sentinel triggers `loadMoreTransactionsAction`; new rows append.
3. Group headers MUST NOT duplicate. A row dated "May 5" should land in the existing May 5 group section, not a fresh "May 5" header below.

If duplicates appear, check `groupTransactionsByDate` is being run on `allRows` (merged), not on `appended` (the new chunk only). The `useMemo` in step 6.1 derives groups from `allRows`; verify that didn't drift.

**Gate 12 — Bulk re-categorize**

On desktop:
1. Click checkboxes on 3 rows across 2 day groups (covers the cross-boundary case).
2. BulkActionBar appears at top of viewport.
3. Click `Re-categorize` → picker opens.
4. Pick a category → sonner toast with "Undo" appears.
5. Rows re-render with new category chip.
6. Click `Undo` → rows revert; "Undone" toast appears.

Failure mode to watch: snapshot of `priorByName` in `<BulkActionBar>` survives `router.refresh()` — it should because the closure captures BEFORE the refresh. If undo restores stale state, T5 was a bad restyle.

**Other UAT gates** — work through:
- Page header eyebrow "Records" + h1 "Transactions" + freshness meta
- KPI strip shows 4 cells with mono numerals + sub-lines
- Net cell green when positive, red when negative
- Group headers presentational only (cursor doesn't land on them)
- Empty groups never render
- Category chips palette restraint (no >3-4 hues visible at once)
- Chip text legible in BOTH themes (UAT must walk dark mode)
- Unknown categories fall back to structural
- ⌘↓ lands on last row of last group (not on a header)
- ⌘↑ lands on first row of first group
- "/" focuses search; filter URL params correct
- "Showing X · N filters applied" / "unfiltered" copy correct
- Mobile row tap → bottom-sheet picker opens
- Mobile re-cat from sheet works; row updates after sync
- `/recurring` drilldown lands at `/transactions?q=<merchant>&from=<6mo>` with results
- `/goals` drilldown lands at `/transactions?category=<pfc>&from=<monthStart>` with results
- Dark mode walk: header + KPI strip + filters + table + chips + day-net headers all readable
- Light mode walk: same
- Sync triggers `revalidatePath('/transactions')`; new rows appear without hard reload

Record failures.

- [ ] **Step 8.2 — Cross-check against the prototype**

Open [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx) side-by-side with the live `/transactions` page. Note visual deltas (eyebrow font weight, KPI strip cell proportions, date-group header typography, chip palette, day-net hue). Decide which are bugs vs. acceptable variance vs. follow-up for R.6 polish.

- [ ] **Step 8.3 — `prefers-reduced-motion` audit**

DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Reload `/transactions`. Verify:
- Row hover transitions are subdued or no-op
- Sheet open/close animations respect the preference (vaul handles this natively)
- No motion-driven hint or affordance is left without a static fallback

- [ ] **Step 8.4 — Production build**

```bash
rm -rf .next && npm run build 2>&1 | tail -30
```
Expected: clean build, 27/27 pages. `/transactions` First Load JS in line with other R.3 routes (~110-140 kB range — operator-shell + bulk-action-bar bundle is heavier than /recurring).

If there's a "Functions cannot be passed directly to Client Components" error mentioning anything in `src/components/transactions/`, that's the **strike-3 RSC bug** from CLAUDE.md > Lessons learned. Trace the offending prop, refactor as a server-rendered children prop, recommit, rebuild.

- [ ] **Step 8.5 — Final RSC boundary grep**

```bash
grep -rn "'use client'" src/components/transactions/
```
Expected: exactly 8 files (bulk-action-bar, category-picker, filter-row, mobile-transactions-shell, operator-pagination, operator-shell, operator-table, transaction-detail-sheet). NO directive on category-chip / transactions-page-header / transactions-summary-strip.

- [ ] **Step 8.6 — Commit each fix as its own commit**

For each finding from steps 8.1-8.5:

```bash
git add <touched files>
git commit -m "fix(r3.3): <terse description of issue>

<one or two sentences on root cause + fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Aim for 0-5 polish commits. R.3.1 hit 3; R.3.2 hit 0. R.3.3 may hit more on the first run since the date-grouping DOM-shape change is brand-new and j/k math is edge-prone.

---

## Acceptance gates (full phase)

R.3.3 ships when:

1. ✅ All 8 tasks (T1-T8) committed atomically on `feat/r3-3-transactions`
2. ✅ `npm run typecheck` passes
3. ✅ `npm run test` passes — baseline 562 + 16 (T1 helpers) = **578** (or higher if T8 added tests)
4. ✅ `npm run build` produces a clean build, 27/27 pages
5. ✅ `npm run dev` renders /transactions cleanly without console errors
6. ✅ Every checkbox in SPEC § UAT criteria checked
7. ✅ KPI strip Spend cell matches dashboard's `monthSpend` digit-for-digit (gate 7)
8. ✅ j/k stress test (30× each direction) passes without skip / stuck / double-step (gate 10)
9. ✅ Mobile infinite scroll merges into existing groups without duplicate headers (gate 11)
10. ✅ Bulk re-categorize across group boundaries works with sonner-with-undo (gate 12)
11. ✅ Dark + light mode parity verified
12. ✅ Drilldowns from /recurring and /goals continue to land correctly
13. ✅ RSC boundary grep clean — exactly 8 `'use client'` files in `src/components/transactions/`; no NEW boundaries introduced
14. ✅ `revalidatePath('/transactions')` wired on `syncItemAction` AND `syncAllItemsAction` (verified in T7 step 7.1-7.2)
15. ✅ Branch ready to merge `--no-ff` to `feat/redesign`

---

## Out of scope (explicit non-goals for R.3.3)

(Carried verbatim from SPEC.md § Out of scope)

- **Drop operator-tier features** — explicitly rejected in scope decision; preserve all
- **Wholesale prototype IA adoption** — explicitly rejected; hybrid scope is the contract
- **Bulk delete / bulk note / bulk flag actions** — only re-categorize is supported today; no scope expansion
- **Full-row inline editing** (vs the existing TransactionDetailSheet model) — out of scope; bottom-sheet stays
- **Per-row flag glyphs** (recurring/transfer/flagged from prototype) → defer to T8 polish or follow-on
- **Saved filter views** — feature, not chrome; defer
- **Date-range picker UX upgrade** → preserve current `?from=` `?to=` text input behavior
- **Other R.3 routes** (Investments, Simulator, Settings) → R.3.4–R.3.6
- **Mobile rebuild** → R.5

---

## Dependencies

**Upstream**:
- R.2 Dashboard shipped on `feat/redesign` (`formatFreshness`, freshness strip pattern)
- R.3.1 Goals shipped on `feat/redesign` (`<GoalsPageHeader>` pattern)
- R.3.2 Recurring shipped on `feat/redesign` (`<RecurringPageHeader>` + `<RecurringSummaryStrip>` patterns; `getSourceHealth` propagation; revalidatePath symmetry on sync actions)
- Reliability Phase 3 shipped (`getSourceHealth(userId)` query)
- Phase 6.3-6.7 operator-tier infrastructure (`OperatorShell` keyboard nav, ⌘K palette, bulk re-cat with sonner undo, cheatsheet) — preserved unchanged

**Downstream**:
- R.3.4 Investments will likely consume `<CategoryChip>` if it adds a per-position categorization concept (none today)
- R.3.5 Simulator continues to consume the same forecast layer; no impact

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Date grouping breaks j/k DOM-traversal-based focus management | **High** | T4 step 4.1 explicitly preserves the index-into-flat-rows[] model; group headers carry NO ref allocation; T4 step 4.2 walks through the absolute-index arithmetic by hand. T8 step 8.1 gate 10 stress-tests with 30× j + 30× k across group boundaries. |
| Bulk re-categorize regressions from token-swap restyle | Medium | T5 step 5.3 EXPLICITLY notes that `applyCategory` / `undoBulk` / `startTransition` / sonner-with-undo flow MUST NOT be touched during the restyle. T8 step 8.1 gate 12 verifies cross-boundary multi-select + Undo. |
| KPI strip Spend value diverges from dashboard's `monthSpend` | **High** | T2 step 2.1 lifts the WHERE clause from dashboard.ts:78-89 VERBATIM (investment exclusion + TRANSFER/LOAN coalesce). T8 step 8.1 gate 7 verifies side-by-side digit-for-digit. |
| Mobile date grouping breaks infinite scroll (duplicate headers) | Medium | T6 step 6.1 derives `groups` from memoized `allRows` (merged), not from `appended`. T8 step 8.1 gate 11 explicitly scrolls past page 1 and verifies merge. |
| Category chip palette becomes "Christmas tree" | Low | T1 step 1.7 keeps `CAUTION_PFCS` a curated 6-entry Set; everything else falls through to structural. T8 step 8.1 confirms visually (max ~3-4 hues per visible page). |
| `<OperatorTable>` DOM shape change breaks horizontal column alignment | Low | T4 step 4.1 uses a single `<colgroup>` to lock column widths across all `<tbody>` sections. T8 visual check on the prototype side-by-side. |
| `--hairline` token missing → structural chip background renders transparent | Low | Pre-flight check in pre-flight section verifies the three tokens exist; if `--hairline` is absent, substitute `bg-[--border]` in T1 step 1.5/1.7 and update test expectations. |
| `revalidatePath('/transactions')` not wired on sync action | Low | T7 step 7.1-7.2 verifies + patches. Gate #14 of acceptance gates blocks merge if missing. |
| Strike-3 RSC boundary failure ("functions across RSC") | Medium | T7 step 7.5 + T8 step 8.5 + T8 step 8.4 production build catches the render-time variant. The 3 new components (category-chip / page-header / summary-strip) intentionally carry NO `'use client'` directive. |
| `<MobileList>` deletion breaks /drift or /investments | Low | T6 step 6.2 grep confirms /drift + /investments still consume `<MobileList>`. We only remove one consumer; component stays in the codebase. |

---

## Locked decisions (carried from SPEC.md)

1. **Scope**: Hybrid (preserve operator features + add prototype IA)
2. **KPI strip**: 4-stat (Spend / Income / Net / Showing)
3. **Date grouping**: Yes; j/k skips group headers
4. **Category chips**: Yes, restrained palette
5. **Freshness strip**: Yes, mirror R.3.1/R.3.2
6. **Page eyebrow**: "Records" (sidebar source-of-truth)

Auto-locked during SPEC design (non-blocking, may be revisited via `fix(r3.3):`):

- "Showing X / Y" denominator dropped — render as "Showing X · N filters applied"
- Mobile date grouping adopted (parity with desktop)
- Category-palette policy locked at SPEC level (3 classes + fallback rule); T1 step 1.7 enumerates the literal lookup table

Auto-locked during PLAN design (non-blocking):

- `currentMonthRange()` helper DUPLICATED into `transaction-totals.ts` rather than exported from `dashboard.ts` (smaller commit surface; future cleanup to `_shared.ts` if a 3rd consumer lands)
- `<OperatorTable>` group headers rendered as in-`<table>` `<tr aria-hidden>` rows inside per-group `<tbody>` sections, NOT separate sibling `<table>` elements (preserves column alignment via single `<colgroup>`)
- `<MobileList>` swapped OFF for /transactions only — it stays in the codebase for /drift, /investments, and elsewhere; the grouping logic inlines into `<MobileTransactionsShell>` because the generic's config surface doesn't express day-net + grouped section chrome
- Mobile `<CategoryChip size="xs">` variant introduced at T3 for the row secondary-line density on small viewports
- `<MobileTransactionsShell>` computes groups internally via `useMemo` over merged `allRows` rather than accepting an `initialGroups` prop from the page (SPEC § Data flow proposed both shapes — internal computation keeps one source of truth and eliminates the risk of `initialGroups + initialRows` drifting if the page rewrites one but not the other)
- KPI strip `Showing` cell value uses `list.rows.length` (per-page count) rather than `list.totalCount` (filter-wide count) — operators scroll past 50 rows and see "Showing 50 · 12 filters applied," matching what's literally on screen. If T8 UAT reads weirdly here, the swap to `list.totalCount` is one-line in `src/app/(app)/transactions/page.tsx`

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/transactions/group-by-date.ts` | Unit (vitest) | 10 |
| `src/lib/transactions/category-palette.ts` | Unit (vitest) | 6 |
| `src/lib/db/queries/transaction-totals.ts` | UAT-validated (no separate test) | 0 |
| Component files | UAT only | 0 |

**Net**: +16 cases. Target post-R.3.3: 562 → **578**.

---

## Cross-references

- [docs/redesign/r3-3-transactions/SPEC.md](SPEC.md) — locked design decisions
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r3-2-recurring/PLAN.md](../r3-2-recurring/PLAN.md) — precedent execution rhythm
- [docs/redesign/r3-1-goals/PLAN.md](../r3-1-goals/PLAN.md) — precedent page-header pattern
- [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx) — prototype reference
- [CLAUDE.md](../../../CLAUDE.md) — especially Architecture > Editorial tokens, Lessons learned > server→client function props (strike-3 watch), Roadmap > Phase 6.3-6.7 operator-tier infrastructure preserved by R.3.3
