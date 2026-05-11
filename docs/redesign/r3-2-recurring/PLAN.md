# Phase R.3.2 — Recurring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/recurring` to adopt the prototype's calendar-window IA (group active outflows by next-charge date), add an Active/Cancelled tab affordance, preserve hike-alert + inflows + recently-cancelled signals, and restyle in Foothold tokens with the editorial Plan-eyebrow header pattern.

**Architecture:** 6 atomic-commit task sequence on `feat/r3-2-recurring` (already cut from `feat/redesign` post-R.3.1 merge). Reuses the existing data layer (`getRecurringStreams`, `getMonthlyRecurringOutflow`, `getSourceHealth`, `formatFreshness`, `isHikeAlert`, `monthlyCost`, `hikeRatio`, `frequencyToMonthlyMultiplier`) — only one small new pure helper file (`calendar-windows.ts` exporting `groupByDateWindow`, `pickNextCharge`, `trendIndicator`). One `'use client'` island only (`<RecurringTabs>` for Active/Cancelled tab state).

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Tailwind + Foothold tokens · Vitest 4.

**Date:** 2026-05-10
**Depends on:** [docs/redesign/r3-2-recurring/SPEC.md](SPEC.md) (8 locked decisions), [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r3-1-goals/PLAN.md](../r3-1-goals/PLAN.md) (precedent execution rhythm)
**Bundle reference:** [claude-design-context/foothold-recurring.jsx](../../../claude-design-context/foothold-recurring.jsx)
**Branch:** `feat/r3-2-recurring` (cut from `feat/redesign`)
**Estimate:** ~3-4 days

---

## Branching + commit rhythm

All work lands on `feat/r3-2-recurring`. One atomic commit per task. Commit subject format: `feat(r3.2): <task summary>`. T6 polish may produce 0–N fixup commits — `fix(r3.2): <issue>`.

When all 6 tasks ship and UAT passes, branch merges `--no-ff` to `feat/redesign` (the long-lived redesign branch). The full milestone single-PRs to `main` after R.6.

---

## Pre-flight (one-time before T1)

- [ ] **Confirm working branch**

```bash
git branch --show-current
```
Expected: `feat/r3-2-recurring`

- [ ] **Confirm SPEC commit present**

```bash
git log --oneline -3
```
Expected to contain: `docs(r3.2): lock R.3.2 recurring SPEC` (8f1ec27)

- [ ] **Snapshot baseline test count**

```bash
npm run test 2>&1 | tail -5
```
Record the passing count. Expected: 549 (post-R.3.1 baseline). Target post-R.3.2: ~560-562 (+11 to +13 from `calendar-windows.test.ts`, minus a small handful from deleted `groupByCategory` test cases).

- [ ] **Read the SPEC end-to-end before T1**

[docs/redesign/r3-2-recurring/SPEC.md](SPEC.md). Section "Final component map" is the canonical inventory of new / modified / deleted files. Section "Locked decisions" governs all ambiguity calls.

- [ ] **Read R.3.1's T7 polish-commit pattern for context**

[docs/redesign/r3-1-goals/PLAN.md § T7](../r3-1-goals/PLAN.md) — establishes the UAT-driven `fix(r3.x):` polish-commit convention.

---

## T1 — Pure helpers (calendar-windows.ts)

**Goal:** Extract `groupByDateWindow`, `pickNextCharge`, and `trendIndicator` as pure functions with full vitest coverage. TDD-first since these are date-math heavy and boundary-edge-prone.

**Files:**
- Create: `src/lib/recurring/calendar-windows.ts`
- Create: `src/lib/recurring/calendar-windows.test.ts`

**Subtasks:**

- [ ] **Step 1.1 — Write `calendar-windows.test.ts` first (TDD)**

```ts
// src/lib/recurring/calendar-windows.test.ts
import { describe, expect, it } from 'vitest';
import {
  groupByDateWindow,
  pickNextCharge,
  trendIndicator,
} from './calendar-windows';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

/**
 * Helper to construct a minimal RecurringStreamRow for tests. Only the
 * fields that calendar-windows.ts touches are required; the rest are
 * stubbed with safe defaults so the type-checker is happy.
 */
function stream(overrides: Partial<RecurringStreamRow>): RecurringStreamRow {
  return {
    id: 'stub',
    plaidStreamId: null,
    direction: 'outflow',
    isActive: true,
    status: 'MATURE',
    merchantName: 'Stub Merchant',
    description: null,
    primaryCategory: null,
    detailedCategory: null,
    averageAmount: '10.00',
    lastAmount: '10.00',
    frequency: 'MONTHLY',
    firstDate: '2026-01-01',
    lastDate: '2026-04-01',
    predictedNextDate: null,
    accountId: 'acct-stub',
    accountName: 'Stub Acct',
    accountMask: '0000',
    ...overrides,
  } as RecurringStreamRow;
}

// ---------- groupByDateWindow ----------

describe('groupByDateWindow', () => {
  // 2026-05-10 is a Sunday. End-of-this-week (Sunday) is 2026-05-10
  // itself. Monday-of-next-week is 2026-05-11. Last day of May is
  // 2026-05-31. June is the next month.
  const TODAY = new Date('2026-05-10T00:00:00Z');

  it('returns empty buckets for empty input', () => {
    expect(groupByDateWindow([], TODAY)).toEqual({
      thisWeek: [],
      laterThisMonth: [],
      nextMonth: [],
      beyond: [],
    });
  });

  it('buckets a stream dated today into thisWeek', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-05-10' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.laterThisMonth).toEqual([]);
  });

  it('buckets a stream dated end-of-this-week (Sunday) into thisWeek', () => {
    // TODAY is Sunday so end-of-this-week IS today. Use a Wed test
    // with a Sun-end-of-week target date to exercise this case.
    const wednesday = new Date('2026-05-13T00:00:00Z'); // Wednesday
    const s = stream({ id: 'a', predictedNextDate: '2026-05-17' }); // Sunday
    const result = groupByDateWindow([s], wednesday);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets next-Monday stream into laterThisMonth', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const s = stream({ id: 'a', predictedNextDate: '2026-05-18' }); // Monday
    const result = groupByDateWindow([s], wednesday);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets last-day-of-month stream into laterThisMonth', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const s = stream({ id: 'a', predictedNextDate: '2026-05-31' });
    const result = groupByDateWindow([s], wednesday);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets first-day-of-next-month stream into nextMonth', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-06-01' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets last-day-of-next-month stream into nextMonth', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-06-30' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets a 90-day-out annual fee into beyond', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-08-15' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.beyond.map((r) => r.id)).toEqual(['a']);
  });

  it('drops streams with null predictedNextDate', () => {
    const s = stream({ id: 'a', predictedNextDate: null });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek).toEqual([]);
    expect(result.laterThisMonth).toEqual([]);
    expect(result.nextMonth).toEqual([]);
    expect(result.beyond).toEqual([]);
  });

  it('drops streams with past predictedNextDate (defensive)', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-05-01' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek).toEqual([]);
    expect(result.laterThisMonth).toEqual([]);
    expect(result.nextMonth).toEqual([]);
    expect(result.beyond).toEqual([]);
  });

  it('sorts within bucket by predictedNextDate ascending', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const a = stream({ id: 'a', predictedNextDate: '2026-05-17' });
    const b = stream({ id: 'b', predictedNextDate: '2026-05-15' });
    const c = stream({ id: 'c', predictedNextDate: '2026-05-16' });
    const result = groupByDateWindow([a, b, c], wednesday);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('handles today-is-Sunday boundary: today→thisWeek, tomorrow→laterThisMonth', () => {
    // TODAY is Sunday 2026-05-10. End-of-this-week IS today.
    // Tomorrow (Mon 2026-05-11) is the start of next week.
    const todayStream = stream({ id: 'a', predictedNextDate: '2026-05-10' });
    const tomorrowStream = stream({ id: 'b', predictedNextDate: '2026-05-11' });
    const result = groupByDateWindow([todayStream, tomorrowStream], TODAY);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['b']);
  });

  it('handles today-is-last-day-of-month boundary: today→thisWeek, tomorrow→nextMonth', () => {
    const eom = new Date('2026-05-31T00:00:00Z'); // Sunday + last day of May
    const todayStream = stream({ id: 'a', predictedNextDate: '2026-05-31' });
    const tomorrowStream = stream({ id: 'b', predictedNextDate: '2026-06-01' });
    const result = groupByDateWindow([todayStream, tomorrowStream], eom);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['b']);
  });
});

// ---------- pickNextCharge ----------

describe('pickNextCharge', () => {
  const TODAY = new Date('2026-05-10T00:00:00Z');

  it('returns null for empty input', () => {
    expect(pickNextCharge([], TODAY)).toBeNull();
  });

  it('returns null when no streams have predictedNextDate', () => {
    const a = stream({ id: 'a', predictedNextDate: null });
    expect(pickNextCharge([a], TODAY)).toBeNull();
  });

  it('returns the stream with the earliest non-null, non-past date', () => {
    const a = stream({ id: 'a', predictedNextDate: '2026-05-20' });
    const b = stream({ id: 'b', predictedNextDate: '2026-05-15' });
    const c = stream({ id: 'c', predictedNextDate: '2026-05-01' }); // past, ignored
    const result = pickNextCharge([a, b, c], TODAY);
    expect(result?.stream.id).toBe('b');
    expect(result?.dateIso).toBe('2026-05-15');
  });
});

// ---------- trendIndicator ----------

describe('trendIndicator', () => {
  it('returns up when lastAmount > averageAmount * 1.05', () => {
    const s = stream({ averageAmount: '100.00', lastAmount: '110.00' });
    expect(trendIndicator(s)).toBe('up');
  });

  it('returns down when lastAmount < averageAmount * 0.95', () => {
    const s = stream({ averageAmount: '100.00', lastAmount: '90.00' });
    expect(trendIndicator(s)).toBe('down');
  });

  it('returns flat when lastAmount is within ±5% of averageAmount', () => {
    const s = stream({ averageAmount: '100.00', lastAmount: '102.00' });
    expect(trendIndicator(s)).toBe('flat');
  });

  it('returns flat when averageAmount is null', () => {
    const s = stream({ averageAmount: null, lastAmount: '100.00' });
    expect(trendIndicator(s)).toBe('flat');
  });

  it('returns flat when lastAmount is null', () => {
    const s = stream({ averageAmount: '100.00', lastAmount: null });
    expect(trendIndicator(s)).toBe('flat');
  });
});
```

- [ ] **Step 1.2 — Run tests to verify they FAIL (TDD red)**

```bash
npm run test src/lib/recurring/calendar-windows.test.ts 2>&1 | tail -10
```
Expected: FAIL with "Cannot find module './calendar-windows'" — confirms tests run, module doesn't exist yet.

- [ ] **Step 1.3 — Implement `calendar-windows.ts`**

```ts
// src/lib/recurring/calendar-windows.ts
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

export type CalendarBuckets = {
  thisWeek: RecurringStreamRow[];
  laterThisMonth: RecurringStreamRow[];
  nextMonth: RecurringStreamRow[];
  beyond: RecurringStreamRow[];
};

export type Trend = 'up' | 'down' | 'flat';

/**
 * Bucket active outflow streams by predictedNextDate relative to today.
 * Boundary semantics (UTC):
 *   - thisWeek: [today, end-of-this-Sunday] (inclusive both ends)
 *   - laterThisMonth: [next-Monday, last-day-of-current-month]
 *   - nextMonth: entire next calendar month, inclusive both ends
 *   - beyond: anything later (typically annual fees)
 *   - dropped: predictedNextDate === null OR date < today
 *
 * Sort within each bucket: predictedNextDate ascending.
 */
export function groupByDateWindow(
  streams: RecurringStreamRow[],
  today: Date,
): CalendarBuckets {
  const todayUtc = startOfUtcDay(today);
  const sundayThisWeek = endOfThisWeekUtc(todayUtc);
  const lastDayOfCurrentMonth = endOfCurrentMonthUtc(todayUtc);
  const lastDayOfNextMonth = endOfNextMonthUtc(todayUtc);

  const buckets: CalendarBuckets = {
    thisWeek: [],
    laterThisMonth: [],
    nextMonth: [],
    beyond: [],
  };

  for (const s of streams) {
    if (!s.predictedNextDate) continue;
    const d = parseUtcDate(s.predictedNextDate);
    if (d < todayUtc) continue;

    if (d <= sundayThisWeek) {
      buckets.thisWeek.push(s);
    } else if (d <= lastDayOfCurrentMonth) {
      buckets.laterThisMonth.push(s);
    } else if (d <= lastDayOfNextMonth) {
      buckets.nextMonth.push(s);
    } else {
      buckets.beyond.push(s);
    }
  }

  const byDateAsc = (a: RecurringStreamRow, b: RecurringStreamRow) =>
    (a.predictedNextDate ?? '').localeCompare(b.predictedNextDate ?? '');
  buckets.thisWeek.sort(byDateAsc);
  buckets.laterThisMonth.sort(byDateAsc);
  buckets.nextMonth.sort(byDateAsc);
  buckets.beyond.sort(byDateAsc);

  return buckets;
}

/**
 * Returns the earliest-dated non-past, non-null stream. Used for the
 * "Next charge" KPI cell.
 */
export function pickNextCharge(
  streams: RecurringStreamRow[],
  today: Date,
): { stream: RecurringStreamRow; dateIso: string } | null {
  const todayUtc = startOfUtcDay(today);
  let best: { stream: RecurringStreamRow; dateIso: string } | null = null;
  for (const s of streams) {
    if (!s.predictedNextDate) continue;
    const d = parseUtcDate(s.predictedNextDate);
    if (d < todayUtc) continue;
    if (!best || s.predictedNextDate < best.dateIso) {
      best = { stream: s, dateIso: s.predictedNextDate };
    }
  }
  return best;
}

/**
 * Direction of the most recent charge vs the rolling average.
 * ±5% threshold; either-null returns flat.
 */
export function trendIndicator(stream: RecurringStreamRow): Trend {
  const last = stream.lastAmount == null ? null : Number(stream.lastAmount);
  const avg = stream.averageAmount == null ? null : Number(stream.averageAmount);
  if (last == null || avg == null || !Number.isFinite(last) || !Number.isFinite(avg)) {
    return 'flat';
  }
  if (avg === 0) return 'flat';
  if (last > avg * 1.05) return 'up';
  if (last < avg * 0.95) return 'down';
  return 'flat';
}

// ---------- internal date helpers (UTC, no timezone drift) ----------

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseUtcDate(iso: string): Date {
  // iso is "YYYY-MM-DD"; UTC-anchor it to avoid local-timezone bucket drift.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function endOfThisWeekUtc(today: Date): Date {
  // Week ends Sunday. JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat.
  // If today is Sunday, end-of-week IS today.
  const dow = today.getUTCDay();
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  const eow = new Date(today);
  eow.setUTCDate(today.getUTCDate() + daysUntilSunday);
  return eow;
}

function endOfCurrentMonthUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
}

function endOfNextMonthUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
}
```

- [ ] **Step 1.4 — Run tests to verify they PASS (TDD green)**

```bash
npm run test src/lib/recurring/calendar-windows.test.ts 2>&1 | tail -10
```
Expected: all ~16 cases PASS.

- [ ] **Step 1.5 — Run full suite + typecheck**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean. Full suite goes from 549 → ~565 (16 new cases).

- [ ] **Step 1.6 — Commit T1**

```bash
git add src/lib/recurring/calendar-windows.ts \
        src/lib/recurring/calendar-windows.test.ts
git commit -m "$(cat <<'EOF'
feat(r3.2): T1 calendar-windows pure helpers

Three pure functions powering the new calendar-window IA:

- groupByDateWindow(streams, today): buckets active outflows into
  {thisWeek, laterThisMonth, nextMonth, beyond} by predictedNextDate.
  UTC date math (mirrors walkBackTrajectory from R.3.1) so vitest
  fixes time without vi.setSystemTime. Drops null-date and past-date
  streams. Sorts each bucket ascending.
- pickNextCharge(streams, today): earliest non-null, non-past
  stream. Powers the "Next charge" KPI cell.
- trendIndicator(stream): up/down/flat per ±5% threshold against
  averageAmount. Powers the per-row trend glyph.

16 vitest cases including all four boundary edges (Sunday-end-of-
week, last-day-of-month, today-is-Sunday, today-is-last-day-of-
month). Highest-risk file in R.3.2 (calendar arithmetic edges) so
TDD-first to lock the contract before any UI consumes it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T2 — Page header + KPI strip

**Goal:** Two new server components mirroring R.3.1's `<GoalsPageHeader>` + `<GoalsSummaryStrip>` patterns. Page chrome only — does not yet wire into `page.tsx`. T5 wires everything together.

**Files:**
- Create: `src/components/recurring/recurring-page-header.tsx`
- Create: `src/components/recurring/recurring-summary-strip.tsx`

**Subtasks:**

- [ ] **Step 2.1 — Inspect R.3.1's `<GoalsPageHeader>` for the exact pattern**

```bash
cat src/components/goals/goals-page-header.tsx
```

The component takes `freshnessHeadline` + `freshnessCaveat` (string + string|null), renders the editorial eyebrow + h1 + right-aligned freshness meta. R.3.2 mirrors this verbatim with route-specific copy.

- [ ] **Step 2.2 — Create `<RecurringPageHeader>` (server component)**

```tsx
// src/components/recurring/recurring-page-header.tsx

/**
 * /recurring page header. Mirrors <GoalsPageHeader> from R.3.1 (which
 * mirrors R.2's dashboard <PageHeader>). Eyebrow + h1 (left) +
 * freshness meta (right). Page sub line ("The monthly charges ...")
 * renders below in page.tsx, not here.
 */
export function RecurringPageHeader({
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
          Plan
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          Recurring
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

- [ ] **Step 2.3 — Create `<RecurringSummaryStrip>` (server component)**

```tsx
// src/components/recurring/recurring-summary-strip.tsx
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { formatCurrencyCompact } from '@/lib/utils';

type Props = {
  monthlyOutflow: number;
  netMonthly: number;
  activeOutflowCount: number;
  nextCharge: { stream: RecurringStreamRow; dateIso: string } | null;
};

/**
 * 3-cell KPI strip per locked decision #8 (Hybrid 3-stat). Mono
 * numerals, sub-line copy. Empty/null next-charge renders an em-dash
 * with a muted "No charges scheduled" sub-line so the cell never
 * collapses.
 */
export function RecurringSummaryStrip({
  monthlyOutflow,
  netMonthly,
  activeOutflowCount,
  nextCharge,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-3">
      <Stat
        label="Monthly outflow"
        value={formatCurrencyCompact(monthlyOutflow)}
        sub={`${activeOutflowCount} ${activeOutflowCount === 1 ? 'outflow' : 'outflows'}`}
      />
      <Stat
        label="Net monthly"
        value={formatCurrencyCompact(netMonthly, { signed: true })}
        sub="inflows minus outflows"
        valueClass={netMonthly >= 0 ? 'text-positive' : 'text-destructive'}
      />
      <Stat
        label="Next charge"
        value={
          nextCharge ? formatChargeDate(nextCharge.dateIso) : '—'
        }
        sub={
          nextCharge
            ? `${pickMerchantLabel(nextCharge.stream)} · ${formatCurrencyCompact(Number(nextCharge.stream.lastAmount ?? nextCharge.stream.averageAmount ?? 0))}`
            : 'No charges scheduled'
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

function formatChargeDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function pickMerchantLabel(stream: RecurringStreamRow): string {
  return (
    stream.merchantName?.trim() ||
    stream.description?.trim() ||
    'Recurring charge'
  );
}
```

- [ ] **Step 2.4 — Verify `formatCurrencyCompact` accepts `{signed: true}`**

```bash
grep -n "signed\|formatCurrencyCompact" src/lib/utils.ts | head -10
```

Expected: `formatCurrencyCompact(amount: number, options?: { signed?: boolean })` exists. If it doesn't accept `signed`, fall back to `formatCurrency` for the Net monthly cell (which already accepts `{signed: true}` per the current `recurring/page.tsx:65`).

- [ ] **Step 2.5 — Typecheck**

```bash
npm run typecheck
```
Expected: clean. No tests added (UAT-only per SPEC § Test plan summary).

- [ ] **Step 2.6 — Commit T2**

```bash
git add src/components/recurring/recurring-page-header.tsx \
        src/components/recurring/recurring-summary-strip.tsx
git commit -m "$(cat <<'EOF'
feat(r3.2): T2 recurring page header + KPI strip components

<RecurringPageHeader> mirrors R.3.1's <GoalsPageHeader>: editorial
eyebrow "Plan" + h1 "Recurring" + right-aligned freshness meta
consuming formatFreshness() output. <RecurringSummaryStrip> renders
the locked Hybrid 3-stat KPI row (Monthly outflow / Net monthly /
Next charge) with merchant + amount sub-line on the Next charge
cell. Mono numerals, signed positive/destructive coloring on Net
monthly, em-dash + "No charges scheduled" fallback when nextCharge
is null.

Both server components. T5 mounts them on /recurring/page.tsx; this
commit ships the visual primitives in isolation per R.3.1 T1
precedent (focused diffs, easier review).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T3 — Active tab content (4 new components + 2 modifications)

**Goal:** The meaty visual + IA assembly. Restyle `<StreamRow>` for calendar-window context (add nextDate + trend cells, Foothold tokens, new `cancelled-archive` variant slot for T4). Restyle `<HikeAlertRow>` for banner context. Build 4 new server components: hike banner, calendar windows wrapper, inflows section, recently cancelled mini section.

**Files:**
- Modify: `src/components/recurring/stream-row.tsx`
- Modify: `src/components/recurring/hike-alert-row.tsx`
- Create: `src/components/recurring/hike-alert-banner.tsx`
- Create: `src/components/recurring/calendar-windows.tsx`
- Create: `src/components/recurring/inflows-section.tsx`
- Create: `src/components/recurring/recently-cancelled-section.tsx`

**Subtasks:**

- [ ] **Step 3.1 — Restyle `<StreamRow>` (Foothold tokens + new cells + new variant)**

Open [src/components/recurring/stream-row.tsx](../../../src/components/recurring/stream-row.tsx). Replace the entire file with:

```tsx
// src/components/recurring/stream-row.tsx
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { trendIndicator } from '@/lib/recurring/calendar-windows';
import { humanizeCategory } from '@/lib/format/category';
import { isHikeAlert, monthlyCost } from '@/lib/recurring/analysis';
import { cn, formatCurrency } from '@/lib/utils';

type Variant = 'outflow' | 'inflow' | 'cancelled' | 'cancelled-archive';

type Props = {
  stream: RecurringStreamRow;
  variant: Variant;
  /** Render the date cell only when the parent is a calendar-window group. */
  showDate?: boolean;
  /** Render the trend glyph only for active outflows in calendar context. */
  showTrend?: boolean;
};

export function StreamRow({
  stream,
  variant,
  showDate = false,
  showTrend = false,
}: Props) {
  if (variant === 'cancelled' || variant === 'cancelled-archive') {
    return <CancelledRow stream={stream} archive={variant === 'cancelled-archive'} />;
  }

  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  const drillHref = drilldownHref(stream);
  const showHikeGlyph = variant === 'outflow' && isHikeAlert(stream);
  const trend = showTrend ? trendIndicator(stream) : null;

  return (
    <li
      className={cn(
        'relative px-5 py-3 sm:px-6',
        drillHref &&
          'transition-colors duration-fast ease-out-quart hover:bg-[--surface-sunken]/60',
      )}
    >
      {drillHref && (
        <Link
          href={drillHref}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`See ${label} transactions`}
        />
      )}
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium text-[--text]">{label}</p>
            <p
              className={cn(
                'whitespace-nowrap font-mono text-sm font-medium tabular-nums',
                variant === 'inflow' ? 'text-positive' : 'text-[--text]',
              )}
            >
              {formatCurrency(monthly)}/mo
            </p>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="text-xs text-[--text-3]">
              {showDate && stream.predictedNextDate && (
                <span className="mr-2 text-[--text-2]">
                  {formatNextDate(stream.predictedNextDate)}
                </span>
              )}
              {humanizeFrequency(stream.frequency)}
              {variant === 'outflow' && stream.status === 'EARLY_DETECTION' && (
                <span className="ml-1.5 text-[--text-3]/80">· early</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {showTrend && trend && <TrendGlyph trend={trend} />}
              {showHikeGlyph && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-[--semantic-caution]"
                  aria-label="Hike detected"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function CancelledRow({
  stream,
  archive,
}: {
  stream: RecurringStreamRow;
  archive: boolean;
}) {
  const label = pickLabel(stream);
  const monthly = monthlyCost(stream);
  return (
    <li className={cn('px-5 py-2 sm:px-6', archive ? 'opacity-70' : 'opacity-60')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-xs text-[--text-2]">
          {label}
          {stream.lastDate && (
            <span className="ml-2 text-[--text-3]">
              · last hit {formatLastHit(stream.lastDate)}
            </span>
          )}
        </p>
        <p className="whitespace-nowrap font-mono text-xs tabular-nums text-[--text-3]">
          {formatCurrency(monthly)}/mo
        </p>
      </div>
    </li>
  );
}

function TrendGlyph({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') {
    return (
      <span
        className="text-[--semantic-caution]"
        title="Trending up"
        aria-label="Trending up"
      >
        ↗
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span
        className="text-[--text-2]"
        title="Trending down"
        aria-label="Trending down"
      >
        ↘
      </span>
    );
  }
  return (
    <span className="text-[--text-3]" title="Flat" aria-label="Flat">
      —
    </span>
  );
}

function drilldownHref(stream: RecurringStreamRow): string | null {
  // Plaid sandbox often leaves merchantName empty but populates description
  // with the raw memo ("AMZN Mktp", "PAYPAL XYZ"). q= ILIKEs name +
  // merchantName, so a description search usually still finds the receipts.
  // Fall through to no-drill rather than category — q=<category> would
  // surface every category-mate as noise.
  const term = stream.merchantName?.trim() || stream.description?.trim();
  if (!term) return null;
  const params = new URLSearchParams();
  params.set('q', term);
  params.set('from', sixMonthsAgoIso());
  return `/transactions?${params.toString()}`;
}

function sixMonthsAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

function pickLabel(stream: RecurringStreamRow): string {
  return (
    stream.merchantName?.trim() ||
    stream.description?.trim() ||
    (stream.primaryCategory ? humanizeCategory(stream.primaryCategory) : '') ||
    'Recurring charge'
  );
}

function humanizeFrequency(f: string): string {
  switch (f) {
    case 'WEEKLY':
      return 'Weekly';
    case 'BIWEEKLY':
      return 'Every 2 weeks';
    case 'SEMI_MONTHLY':
      return 'Twice a month';
    case 'MONTHLY':
      return 'Monthly';
    case 'ANNUALLY':
      return 'Annually';
    default:
      return 'Recurring';
  }
}

function formatNextDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatLastHit(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 3.2 — Restyle `<HikeAlertRow>` (banner-context Foothold tokens)**

Open [src/components/recurring/hike-alert-row.tsx](../../../src/components/recurring/hike-alert-row.tsx). Replace the file with:

```tsx
// src/components/recurring/hike-alert-row.tsx
import Link from 'next/link';
import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';
import { hikeRatio } from '@/lib/recurring/analysis';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type Props = {
  stream: RecurringStreamRow;
};

export function HikeAlertRow({ stream }: Props) {
  const ratio = hikeRatio(stream);
  if (
    ratio == null ||
    stream.lastAmount == null ||
    stream.averageAmount == null
  ) {
    return null;
  }

  const label = pickLabel(stream);
  const drillHref = drilldownHref(stream);
  const lastNum = Number(stream.lastAmount);
  const avgNum = Number(stream.averageAmount);
  const deltaMonthly =
    (lastNum - avgNum) * frequencyToMonthlyMultiplier(stream.frequency);

  return (
    <li
      className={cn(
        'relative px-5 py-3 sm:px-6',
        drillHref &&
          'transition-colors duration-fast ease-out-quart hover:bg-[--surface-sunken]/60',
      )}
    >
      {drillHref && (
        <Link
          href={drillHref}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`See ${label} transactions`}
        />
      )}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-[--text]">{label}</p>
          <p className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-[--text]">
            {formatCurrency(lastNum)}/mo
            <span className="ml-2 text-xs font-normal text-[--text-3]">
              was {formatCurrency(avgNum)}
            </span>
          </p>
        </div>
        <p className="text-xs font-medium text-[--semantic-caution]">
          +{formatPercent(ratio)} vs avg · +{formatCurrency(deltaMonthly)}/mo
        </p>
      </div>
    </li>
  );
}

function drilldownHref(stream: RecurringStreamRow): string | null {
  const term = stream.merchantName?.trim() || stream.description?.trim();
  if (!term) return null;
  const params = new URLSearchParams();
  params.set('q', term);
  params.set('from', sixMonthsAgoIso());
  return `/transactions?${params.toString()}`;
}

function sixMonthsAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

function pickLabel(stream: RecurringStreamRow): string {
  return (
    stream.merchantName?.trim() ||
    stream.description?.trim() ||
    (stream.primaryCategory ? humanizeCategory(stream.primaryCategory) : '') ||
    'Recurring charge'
  );
}
```

- [ ] **Step 3.3 — Create `<HikeAlertBanner>`**

```tsx
// src/components/recurring/hike-alert-banner.tsx
import { AlertTriangle } from 'lucide-react';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { HikeAlertRow } from './hike-alert-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * Amber-bordered block that surfaces stream(s) whose lastAmount is
 * >15% above averageAmount with a $2/mo monthly-equivalent floor.
 * Renders only when streams.length > 0 (caller-gated).
 */
export function HikeAlertBanner({ streams }: Props) {
  return (
    <section
      className="rounded-card border border-[--semantic-caution]/40 bg-[--semantic-caution]/5 p-4"
      role="region"
      aria-label="Hike alerts"
    >
      <header className="mb-3 flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 text-[--semantic-caution]"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[--semantic-caution]">
          {streams.length} hike alert{streams.length === 1 ? '' : 's'}
        </p>
      </header>
      <ul className="divide-y divide-[--semantic-caution]/20">
        {streams.map((s) => (
          <HikeAlertRow key={s.id} stream={s} />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3.4 — Create `<CalendarWindows>`**

```tsx
// src/components/recurring/calendar-windows.tsx
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import type { CalendarBuckets } from '@/lib/recurring/calendar-windows';
import { monthlyCost } from '@/lib/recurring/analysis';
import { formatCurrency } from '@/lib/utils';
import { StreamRow } from './stream-row';

type Props = {
  windows: CalendarBuckets;
};

/**
 * Renders up to 4 calendar window groups (THIS WEEK / LATER THIS
 * MONTH / NEXT MONTH / LATER) from groupByDateWindow output. Each
 * group renders only when its bucket has streams. Group sub-line
 * shows the date range; group total shows monthly-equivalent sum.
 */
export function CalendarWindows({ windows }: Props) {
  return (
    <div className="space-y-6">
      <Window
        label="This week"
        streams={windows.thisWeek}
        rangeFormatter={formatWeekRange}
      />
      <Window
        label="Later this month"
        streams={windows.laterThisMonth}
        rangeFormatter={formatRange}
      />
      <Window
        label="Next month"
        streams={windows.nextMonth}
        rangeFormatter={formatRange}
      />
      <Window
        label="Later"
        streams={windows.beyond}
        rangeFormatter={formatRange}
      />
    </div>
  );
}

function Window({
  label,
  streams,
  rangeFormatter,
}: {
  label: string;
  streams: RecurringStreamRow[];
  rangeFormatter: (streams: RecurringStreamRow[]) => string;
}) {
  if (streams.length === 0) return null;
  const total = streams.reduce((sum, s) => sum + monthlyCost(s), 0);
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            {label}
          </p>
          <p className="mt-0.5 text-xs text-[--text-3]">
            {streams.length} {streams.length === 1 ? 'charge' : 'charges'} ·{' '}
            {rangeFormatter(streams)}
          </p>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums text-[--text-2]">
          {formatCurrency(total)}/mo total
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow
            key={s.id}
            stream={s}
            variant="outflow"
            showDate
            showTrend
          />
        ))}
      </ul>
    </section>
  );
}

function formatWeekRange(streams: RecurringStreamRow[]): string {
  if (streams.length === 0) return '';
  const first = streams[0].predictedNextDate;
  const last = streams[streams.length - 1].predictedNextDate;
  if (!first || !last) return '';
  return `${formatShort(first)} → ${formatShort(last)}`;
}

function formatRange(streams: RecurringStreamRow[]): string {
  if (streams.length === 0) return '';
  const first = streams[0].predictedNextDate;
  const last = streams[streams.length - 1].predictedNextDate;
  if (!first || !last) return '';
  if (first === last) return formatShort(first);
  return `${formatShort(first)} → ${formatShort(last)}`;
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 3.5 — Create `<InflowsSection>`**

```tsx
// src/components/recurring/inflows-section.tsx
import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { formatCurrency } from '@/lib/utils';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

export function InflowsSection({ streams }: Props) {
  const total = streams.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return (
      sum +
      Math.abs(Number(s.averageAmount)) *
        frequencyToMonthlyMultiplier(s.frequency)
    );
  }, 0);

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Inflows
          </p>
          <p className="mt-0.5 text-xs text-[--text-3]">
            {streams.length} {streams.length === 1 ? 'stream' : 'streams'}
          </p>
        </div>
        <p className="font-mono text-sm font-medium tabular-nums text-positive">
          {formatCurrency(total)}/mo
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="inflow" />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3.6 — Create `<RecentlyCancelledSection>`**

```tsx
// src/components/recurring/recently-cancelled-section.tsx
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * 90-day TOMBSTONED window. Low-emphasis chrome (StreamRow's cancelled
 * variant carries opacity-60). Renders only when caller passes >0
 * streams. The full all-time archive lives in the Cancelled tab via
 * <CancelledArchiveList>.
 */
export function RecentlyCancelledSection({ streams }: Props) {
  return (
    <section className="space-y-3">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Recently cancelled
        </p>
        <p className="mt-0.5 text-xs text-[--text-3]">
          {streams.length} {streams.length === 1 ? 'stream' : 'streams'} · last 90 days
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="cancelled" />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3.7 — Typecheck**

```bash
npm run typecheck
```
Expected: clean. If `text-positive` / `text-destructive` / `bg-surface` arbitrary classes don't resolve, those are tailwind-config mappings (live, no change needed). The `text-[--text]` / `bg-[--surface]` / `text-[--semantic-caution]` arbitrary values resolve directly because those tokens are complete-color (not HSL fragments) per CLAUDE.md > Foothold Redesign milestone § Dual-token gotcha.

- [ ] **Step 3.8 — Run full suite**

```bash
npm run test 2>&1 | tail -5
```
Expected: same count as post-T1 (T3 introduces no test cases — UAT-only per SPEC).

- [ ] **Step 3.9 — Commit T3**

```bash
git add src/components/recurring/stream-row.tsx \
        src/components/recurring/hike-alert-row.tsx \
        src/components/recurring/hike-alert-banner.tsx \
        src/components/recurring/calendar-windows.tsx \
        src/components/recurring/inflows-section.tsx \
        src/components/recurring/recently-cancelled-section.tsx
git commit -m "$(cat <<'EOF'
feat(r3.2): T3 active tab content (4 new components + 2 restyles)

Largest task in R.3.2. Visual + IA assembly for the Active tab body.

New server components:
- <HikeAlertBanner>: amber-bordered block; renders only when caller
  passes >0 hike streams. Uses --semantic-caution token.
- <CalendarWindows>: renders up to 4 calendar window groups (This
  week / Later this month / Next month / Later) from
  groupByDateWindow output. Each group hides itself when its bucket
  is empty. Sub-line shows date range; right-side shows monthly
  equivalent total.
- <InflowsSection>: payroll/dividend/refund streams under "Inflows"
  eyebrow. Total sums monthly equivalents using
  frequencyToMonthlyMultiplier (avoids double-counting weekly
  inflows).
- <RecentlyCancelledSection>: 90-day TOMBSTONED window. Low-
  emphasis (StreamRow's cancelled variant carries opacity-60).

Modified:
- <StreamRow>: Foothold token restyle (--text, --text-2, --text-3,
  --surface-sunken, --semantic-caution); adds optional showDate +
  showTrend props for calendar-window context; adds
  cancelled-archive variant slot for T4. Logic untouched (drilldown
  predicate, label picker, frequency humanizer all preserved).
- <HikeAlertRow>: same Foothold restyle in banner context;
  --semantic-caution replaces hardcoded amber-700/300.

T5 mounts these into /recurring/page.tsx via the Active tab body
slot of <RecurringTabs>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T4 — Cancelled archive list

**Goal:** Single new server component for the Cancelled tab body. Reuses `<StreamRow>` with the `cancelled-archive` variant added in T3.

**Files:**
- Create: `src/components/recurring/cancelled-archive-list.tsx`

**Subtasks:**

- [ ] **Step 4.1 — Create `<CancelledArchiveList>`**

```tsx
// src/components/recurring/cancelled-archive-list.tsx
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { StreamRow } from './stream-row';

type Props = {
  streams: RecurringStreamRow[];
};

/**
 * Cancelled tab body. Full TOMBSTONED archive — no 90d filter; sorted
 * by lastDate desc by the caller (page.tsx). Renders the empty state
 * inline when the user has zero cancelled streams ever.
 */
export function CancelledArchiveList({ streams }: Props) {
  if (streams.length === 0) {
    return (
      <div className="rounded-card bg-[--surface] p-8 text-center">
        <p className="text-sm text-[--text-2]">No cancelled streams yet.</p>
        <p className="mt-1 text-xs text-[--text-3]">
          When a recurring charge stops appearing, it'll show up here.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          All cancelled
        </p>
        <p className="mt-0.5 text-xs text-[--text-3]">
          {streams.length} {streams.length === 1 ? 'stream' : 'streams'} · all-time
        </p>
      </header>
      <ul className="divide-y divide-[--border]/60 overflow-hidden rounded-card bg-[--surface]">
        {streams.map((s) => (
          <StreamRow key={s.id} stream={s} variant="cancelled-archive" />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4.2 — Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 4.3 — Commit T4**

```bash
git add src/components/recurring/cancelled-archive-list.tsx
git commit -m "$(cat <<'EOF'
feat(r3.2): T4 cancelled archive list

Single server component for the Cancelled tab body. Renders the
full TOMBSTONED archive (no 90d filter, sorted desc by lastDate by
caller). Reuses <StreamRow variant="cancelled-archive"> from T3 —
opacity-70 chrome distinct from the recently-cancelled mini-section
which uses opacity-60.

Empty state renders inline when the user has zero cancelled
streams ever — distinct from the page-level <EmptyState> which
gates on getRecurringStreams().length === 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T5 — Tabs island + page rewrite + cleanup

**Goal:** Wholesale rewrite of `/recurring/page.tsx` with new composition + Active/Cancelled tabs island. Delete obsolete `<RecurringOverview>` and `groupByCategory` (now dead). Strike-3 watch on RSC boundary.

**Files:**
- Create: `src/components/recurring/recurring-tabs.tsx` (the only `'use client'` island in R.3.2)
- Modify: `src/app/(app)/recurring/page.tsx` (wholesale rewrite)
- Delete: `src/components/recurring/recurring-overview.tsx`
- Modify: `src/lib/recurring/analysis.ts` (remove `groupByCategory` export + its tests)

**Subtasks:**

- [ ] **Step 5.1 — Create `<RecurringTabs>` (client island)**

```tsx
// src/components/recurring/recurring-tabs.tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  /** Server-rendered tree for the Active tab body. RSC element, not a function. */
  active: React.ReactNode;
  /** Server-rendered tree for the Cancelled tab body. RSC element, not a function. */
  cancelled: React.ReactNode;
};

/**
 * Active / Cancelled tab island. Owns ONLY tab visibility state.
 * Both tab bodies are passed as server-rendered React element trees
 * (children-prop pattern) — never functions — to honor the RSC
 * serialization rules from CLAUDE.md > Lessons learned § "Don't
 * pass functions across the server→client boundary in config props".
 */
export function RecurringTabs({ active, cancelled }: Props) {
  const [tab, setTab] = useState<'active' | 'cancelled'>('active');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Filter recurring streams"
        className="inline-flex items-center gap-1 rounded-pill bg-[--surface] p-1"
      >
        <TabPill
          label="Active"
          active={tab === 'active'}
          onClick={() => setTab('active')}
        />
        <TabPill
          label="Cancelled"
          active={tab === 'cancelled'}
          onClick={() => setTab('cancelled')}
        />
      </div>
      <div role="tabpanel">{tab === 'active' ? active : cancelled}</div>
    </div>
  );
}

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-pill px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-[--surface-elevated] text-[--text]'
          : 'text-[--text-2] hover:text-[--text]',
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 5.2 — Verify `revalidatePath('/recurring')` is wired on the sync action**

```bash
grep -rn "revalidatePath" src/lib/sync/ src/lib/plaid/ src/lib/snaptrade/ 2>&1 | grep -i "recurring\|all\|sync" | head -10
```
Expected: at least one of:
- `revalidatePath('/recurring')` explicitly
- `revalidatePath('/', 'layout')` (revalidates everything below root layout)
- A wholesale revalidation pattern that subsumes /recurring

If NONE present, add `revalidatePath('/recurring')` at the bottom of `syncItemAction` in `src/lib/sync/actions.ts` (or wherever the sync action returns to its caller). Reactivity is gate #11 of acceptance gates; we cannot ship without it.

- [ ] **Step 5.3 — Rewrite `/recurring/page.tsx`**

Replace the entire file:

```tsx
// src/app/(app)/recurring/page.tsx
import Link from 'next/link';
import { ArrowRight, Repeat } from 'lucide-react';
import { auth } from '@/auth';
import { CalendarWindows } from '@/components/recurring/calendar-windows';
import { CancelledArchiveList } from '@/components/recurring/cancelled-archive-list';
import { HikeAlertBanner } from '@/components/recurring/hike-alert-banner';
import { InflowsSection } from '@/components/recurring/inflows-section';
import { RecentlyCancelledSection } from '@/components/recurring/recently-cancelled-section';
import { RecurringPageHeader } from '@/components/recurring/recurring-page-header';
import { RecurringSummaryStrip } from '@/components/recurring/recurring-summary-strip';
import { RecurringTabs } from '@/components/recurring/recurring-tabs';
import { Button } from '@/components/ui/button';
import { getSourceHealth } from '@/lib/db/queries/health';
import {
  frequencyToMonthlyMultiplier,
  getMonthlyRecurringOutflow,
  getRecurringStreams,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { formatFreshness } from '@/lib/format/freshness';
import {
  groupByDateWindow,
  pickNextCharge,
} from '@/lib/recurring/calendar-windows';
import { isHikeAlert } from '@/lib/recurring/analysis';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function RecurringPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [streams, monthlyOutflow, sourceHealth] = await Promise.all([
    getRecurringStreams(session.user.id),
    getMonthlyRecurringOutflow(session.user.id),
    getSourceHealth(session.user.id),
  ]);

  if (streams.length === 0) {
    return <EmptyState />;
  }

  const today = new Date();

  const activeOutflows = streams.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const activeInflows = streams.filter(
    (s) => s.direction === 'inflow' && s.isActive,
  );
  const hikes = activeOutflows.filter(isHikeAlert);
  const recentCancelled = streams
    .filter(isRecentlyCancelled)
    .sort(byLastDateDesc);
  const allCancelled = streams
    .filter((s) => s.status === 'TOMBSTONED')
    .sort(byLastDateDesc);

  const windows = groupByDateWindow(activeOutflows, today);
  const nextCharge = pickNextCharge(activeOutflows, today);

  const monthlyInflow = activeInflows.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return (
      sum +
      Math.abs(Number(s.averageAmount)) *
        frequencyToMonthlyMultiplier(s.frequency)
    );
  }, 0);
  const netMonthly = monthlyInflow - monthlyOutflow;

  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
    now: today,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <RecurringPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <p className="text-sm text-[--text-2]">
        The monthly charges that move on autopilot.
      </p>
      <RecurringSummaryStrip
        monthlyOutflow={monthlyOutflow}
        netMonthly={netMonthly}
        activeOutflowCount={activeOutflows.length}
        nextCharge={nextCharge}
      />
      <RecurringTabs
        active={
          <div className="space-y-6">
            {hikes.length > 0 && <HikeAlertBanner streams={hikes} />}
            <CalendarWindows windows={windows} />
            {activeInflows.length > 0 && (
              <InflowsSection streams={activeInflows} />
            )}
            {recentCancelled.length > 0 && (
              <RecentlyCancelledSection streams={recentCancelled} />
            )}
          </div>
        }
        cancelled={<CancelledArchiveList streams={allCancelled} />}
      />
    </div>
  );
}

function isRecentlyCancelled(stream: RecurringStreamRow): boolean {
  if (stream.status !== 'TOMBSTONED') return false;
  if (!stream.lastDate) return false;
  const last = Date.parse(stream.lastDate);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= NINETY_DAYS_MS;
}

function byLastDateDesc(a: RecurringStreamRow, b: RecurringStreamRow): number {
  return Date.parse(b.lastDate ?? '1970-01-01') - Date.parse(a.lastDate ?? '1970-01-01');
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-[--surface] text-[--text-2]">
          <Repeat className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[--text]">
            Not enough history yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
            Plaid needs 60–90 days of transaction data to detect
            subscriptions, payroll, and bills. Connecting more accounts
            shortens the wait.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect more accounts
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4 — Delete `<RecurringOverview>`**

```bash
git rm src/components/recurring/recurring-overview.tsx
```

- [ ] **Step 5.5 — Delete `groupByCategory` from `analysis.ts` + its tests**

Open [src/lib/recurring/analysis.ts](../../../src/lib/recurring/analysis.ts). Remove the `groupByCategory` function export AND any helper that's only used by it. The other exports (`isHikeAlert`, `monthlyCost`, `hikeRatio`, `frequencyToMonthlyMultiplier`) MUST remain — still consumed by `<HikeAlertBanner>`, `<HikeAlertRow>`, `<StreamRow>`, `<InflowsSection>`, and the page itself.

```bash
grep -n "export function\|export const" src/lib/recurring/analysis.ts
```

After the edit, expected exports: `isHikeAlert`, `monthlyCost`, `hikeRatio`, `frequencyToMonthlyMultiplier`. NOT `groupByCategory`.

Then open [src/lib/recurring/analysis.test.ts](../../../src/lib/recurring/analysis.test.ts) and delete any `describe('groupByCategory', …)` block. Run:

```bash
grep -n "describe\|groupByCategory" src/lib/recurring/analysis.test.ts
```
Expected: no `groupByCategory` references remain; other describe blocks intact.

- [ ] **Step 5.6 — RSC boundary grep**

```bash
grep -rn "'use client'" src/components/recurring/
```
Expected matches: ONLY `recurring-tabs.tsx`. No other recurring component should carry `'use client'`. If any do, that's a regression — investigate before continuing.

- [ ] **Step 5.7 — Typecheck + tests + dev render**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean. Test count = post-T1 minus the deleted `groupByCategory` cases.

Then start dev (in a separate terminal — don't background here) and visit http://localhost:3000/recurring. Sanity-check:
- Page renders without console errors
- Active tab is default
- Tab toggle works
- Hike banner appears (if any hikes in your data); calendar windows render in order; inflows section appears if any inflows; recently cancelled appears if any 90d cancellations

Don't fix anything you find here — just verify the page boots. Real UAT is T6.

- [ ] **Step 5.8 — Commit T5**

```bash
git add src/components/recurring/recurring-tabs.tsx \
        "src/app/(app)/recurring/page.tsx" \
        src/lib/recurring/analysis.ts \
        src/lib/recurring/analysis.test.ts
git rm src/components/recurring/recurring-overview.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
feat(r3.2): T5 tabs island + page rewrite + cleanup

Wholesale /recurring/page.tsx rewrite assembling T2-T4 components
into the locked IA. Single client island <RecurringTabs> manages
Active/Cancelled tab state; both tab bodies pass through as server-
rendered React element trees (children-prop pattern, never
functions) — strike-3 watch on the CLAUDE.md
"don't pass functions across server→client boundary" lesson.

Three-call Promise.all (getRecurringStreams,
getMonthlyRecurringOutflow, getSourceHealth) feeds page-level
synchronous derivations: activeOutflows, activeInflows, hikes,
recentCancelled (90d window), allCancelled (full archive),
windows (groupByDateWindow output), nextCharge (pickNextCharge
output), monthlyInflow, netMonthly.

Active tab body = HikeAlertBanner (if hikes>0) → CalendarWindows →
InflowsSection (if inflows>0) → RecentlyCancelledSection
(if recentCancelled>0). Cancelled tab body = CancelledArchiveList.

Cleanup:
- Deleted <RecurringOverview> (replaced by direct page.tsx
  composition).
- Removed groupByCategory export from analysis.ts + its test
  cases (no consumers remain after RecurringOverview deletion).
- Other analysis.ts exports preserved (isHikeAlert, monthlyCost,
  hikeRatio, frequencyToMonthlyMultiplier — still consumed by
  multiple components).

revalidatePath('/recurring') verified wired on sync action prior
to commit (gate #11 of acceptance gates).

RSC boundary grep clean — only recurring-tabs.tsx carries
'use client' in src/components/recurring/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T6 — UAT polish reservation

**Goal:** Reserved fixup commits surfaced during the post-T5 UAT pass. Analogous to R.3.1's T7 (which produced 0 polish commits because UAT passed clean; R.3.2 may produce more since this is the first calendar-window IA in the codebase).

**Process:**

- [ ] **Step 6.1 — Run full UAT pass against SPEC § UAT criteria**

Walk every checkbox in [SPEC.md § UAT criteria](SPEC.md#uat-criteria). Record failures.

- [ ] **Step 6.2 — Cross-check against the prototype**

Open [claude-design-context/foothold-recurring.jsx](../../../claude-design-context/foothold-recurring.jsx) side-by-side with the live `/recurring` page. Note visual deltas (eyebrow font weight, group spacing, KPI strip cell proportions, trend glyph hue). Decide which are bugs vs. acceptable variance vs. follow-up for R.6 polish phase.

- [ ] **Step 6.3 — Drilldown verification**

Click a row in each calendar window:
- Active outflow row → should land on `/transactions?q=<merchant>&from=<6mo-iso>` with results visible
- Inflow row → same drilldown contract
- Cancelled row (90d mini OR full archive) → should NOT be clickable; cursor stays default
- Hike banner row → should drilldown to `/transactions` for the hiked merchant

- [ ] **Step 6.4 — Mutation reactivity verification**

Trigger a sync from `/settings` (Sync button on a Plaid item). After the sync completes:
- Any newly-detected stream appears in the appropriate calendar window (no hard refresh)
- Any newly-TOMBSTONED stream migrates from active → recently cancelled
- Any newly-detected hike adjusts the hike banner count

If the page doesn't auto-update, verify Step 5.2's revalidatePath addition is actually firing (check Vercel/dev logs for the action's response).

- [ ] **Step 6.5 — Dark mode parity pass**

Toggle theme via the user dropdown. Walk both tabs. Verify:
- KPI strip + tabs + hike banner + all calendar windows + inflows + recently cancelled all render correctly in dark mode
- Trend glyphs (↗ ↘ —) read correctly in both themes
- Amber `--semantic-caution` hue on hike banner border + glyphs is visible without being garish in either theme

- [ ] **Step 6.6 — `prefers-reduced-motion` audit**

DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Reload `/recurring`. Verify:
- Tab toggle still works without animation lag
- Row hover transitions don't fire (or fire with reduced animation)

R.3.2 has minimal motion to begin with; this is mostly a sanity check.

- [ ] **Step 6.7 — RSC boundary grep + production build**

```bash
grep -rn "'use client'" src/components/recurring/
```
Expected: only `recurring-tabs.tsx`.

```bash
rm -rf .next && npm run build 2>&1 | tail -30
```
Expected: clean build, 27/27 pages, `/recurring` First Load JS in line with R.3.1's pages (~105-130 kB range).

If there's a "Functions cannot be passed directly to Client Components" error mentioning `<RecurringTabs>` or any of its children, that's the strike-3 RSC bug from CLAUDE.md > Lessons learned. Trace the offending prop, refactor as a server-rendered children prop, recommit, rebuild.

- [ ] **Step 6.8 — Commit each fix as its own commit**

For each finding from steps 6.1-6.7:

```bash
git add <touched files>
git commit -m "fix(r3.2): <terse description of issue>

<one or two sentences on root cause + fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Aim for 0-5 polish commits. R.3.1 hit 3 polish commits before the user's UAT confirmation (% label position + redirect regex). R.3.2 may hit more on the first run since calendar-window IA is brand-new and date math is edge-prone.

---

## Acceptance gates (full phase)

R.3.2 ships when:

1. ✅ All 6 tasks (T1-T6) committed atomically on `feat/r3-2-recurring`
2. ✅ `npm run typecheck` passes
3. ✅ `npm run test` passes — baseline 549 + ~16 (calendar-windows.test.ts) − N (deleted groupByCategory cases) ≈ ~560-563
4. ✅ `npm run build` produces a clean build, 27/27 pages
5. ✅ `npm run dev` renders /recurring cleanly without console errors
6. ✅ Every checkbox in SPEC § UAT criteria checked
7. ✅ Active/Cancelled tab toggle works; default = Active
8. ✅ Hike banner shows when ≥1 hike present, hides at 0
9. ✅ Empty calendar windows render no group header (silent, including the optional "Later" group)
10. ✅ Dark + light mode parity verified on /recurring (both tabs)
11. ✅ Mutations that resolve a stream to TOMBSTONED revalidate /recurring (`revalidatePath('/recurring')` wired on sync action; T5 step 5.2 verifies)
12. ✅ Drilldown rows (active outflow + inflow): clicking lands on `/transactions?q=<merchant>&from=<6mo>` with results
13. ✅ Cancelled rows (both 90d mini and full archive) are NOT clickable (no drilldown)
14. ✅ RSC boundary grep clean — only `recurring-tabs.tsx` carries `'use client'` in `src/components/recurring/`
15. ✅ Branch ready to merge `--no-ff` to `feat/redesign`

---

## Out of scope (explicit non-goals for R.3.2)

(Carried verbatim from SPEC.md § Out of scope)

- **Snooze feature** (UX + schema column) → R.4 or later
- **Manual recurring stream creation** ("Add manually" button in prototype) → no backend; deferred
- **"Find a charge" search bar** in toolbar → /transactions already covers this
- **Per-stream cancel action** from /recurring → no backend
- **Annualized total KPI** → dropped per Hybrid 3-stat decision
- **Active count as a standalone KPI cell** → folded into Monthly outflow sub-line
- **Trend indicator history chart** (sparkline per stream) → too heavy
- **Cancelled tab pagination** → assume <100 cancelled streams per user
- **Other R.3 routes** (Transactions, Investments, Simulator, Settings) → R.3.3–R.3.6
- **Mobile rebuild** → R.5

---

## Dependencies

**Upstream**:
- R.2 Dashboard shipped on `feat/redesign` (provides `formatFreshness`, freshness strip pattern)
- R.3.1 Goals shipped on `feat/redesign` (provides `<GoalsPageHeader>` exact pattern, archived-toggle pattern as island reference)
- Reliability Phase 3 shipped (`getSourceHealth(userId)` query)

**Downstream**:
- R.3.3 Transactions inherits the `formatFreshness` propagation pattern + the tab-island convention if it needs filter pills
- R.3.6 Settings already uses `getSourceHealth` (Phase 4); no impact

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `groupByDateWindow` off-by-one at week/month boundaries | **High** | T1 step 1.1 covers all four boundary edges with explicit vitest cases (today-is-Sunday, today-is-last-day-of-month, end-of-week Sunday, last-day-of-month). UTC date math throughout (no timezone drift). |
| RSC boundary failure on `<RecurringTabs>` (strike-3 watch) | Medium | T5 step 5.6 explicit RSC grep before commit. T6 step 6.7 production build catches the render-time variant. SPEC § Risks documents this at the SPEC level. |
| `<StreamRow>` 4-variant overload becomes unwieldy | Low | If switch grows further (R.3.3 Transactions might add a 5th variant), split `<CancelledArchiveRow>` into its own file in T-polish. The variant prop is the canary. |
| Drilldown predicate change breaks existing /recurring → /transactions UX | Low | T3 step 3.1 lifts the predicate verbatim from current `stream-row.tsx:91-103`; do not touch the logic during the restyle. |
| `revalidatePath('/recurring')` not wired on sync action | Medium | T5 step 5.2 verifies before commit. Gate #11 of acceptance gates blocks merge if missing. |
| `null` predictedNextDate streams silently drop, user notices missing rows | Low | Auto-locked SPEC decision. T6 step 6.1 UAT walks through real data; if the count is non-trivial, T-polish adds an "Unscheduled" section. |
| Cancelled archive grows unbounded for long-term users | Low | Out-of-scope: pagination. T-polish revisits if real data crosses ~100. |
| `formatCurrencyCompact` doesn't accept `{signed: true}` | Low | T2 step 2.4 verifies before commit. Fallback to `formatCurrency` (which does accept it per current page line 65). |

---

## Locked decisions (carried from SPEC.md)

1. **IA framing**: Calendar windows (prototype wholesale)
2. **Hike alerts**: Banner above calendar windows
3. **Status filter UI**: Tabs lite (Active / Cancelled)
4. **Inflows**: Keep below calendar windows in Active tab
5. **Cancelled scope**: 90d ambient mini in Active tab; full archive in Cancelled tab
6. **Page eyebrow**: "Plan" (sidebar source-of-truth)
7. **Freshness strip**: Yes — mirror R.3.1 / R.2
8. **Summary KPI strip**: Hybrid 3-stat (Outflow / Net monthly / Next charge)

Auto-locked during design (non-blocking, may be revisited via `fix(r3.2):`):

- Streams with `null` predictedNextDate dropped from calendar windows (not bucketed into "Unscheduled")
- `trendIndicator` threshold ±5%
- Past-dated streams dropped from calendar windows (defensive)
- `beyond` bucket renders as a 4th calendar window section labeled "Later" (only when populated)

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/recurring/calendar-windows.ts` | Unit (vitest) | ~16 |
| `src/lib/recurring/analysis.ts` | DELETED `groupByCategory` test cases | −2 to −4 |
| Component files | UAT only | 0 |
| `<RecurringTabs>` client island | UAT only | 0 (trivial useState) |

**Net**: +12 to +14 cases. Target post-R.3.2: 549 → ~561-563.

---

## Cross-references

- [docs/redesign/r3-2-recurring/SPEC.md](SPEC.md) — locked design decisions
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r3-1-goals/PLAN.md](../r3-1-goals/PLAN.md) — precedent execution rhythm
- [claude-design-context/foothold-recurring.jsx](../../../claude-design-context/foothold-recurring.jsx) — prototype reference
- [CLAUDE.md](../../../CLAUDE.md) — project orientation (especially Architecture > Editorial tokens, Lessons learned > server→client function props)
