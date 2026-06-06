import { describe, expect, it } from 'vitest';

import type { ForecastHistory, MonthlyProjection } from '@/lib/forecast/types';

import {
  applyAdjustRecurring,
  applyIncomeEvent,
  applyReduceCategory,
  applySkipOnce,
} from './appliers';

// =============================================================================
// Test helpers
// =============================================================================

type ChainOpts = {
  inflows?: number;
  outflows?: number;
  startCash?: number;
  byCategory?: Record<string, number>;
};

/**
 * Build a chained MonthlyProjection[] with uniform inflows/outflows. Each
 * month's endCash flows into the next month's startCash so chain invariants
 * hold from the start (applier output is compared against unchanged-chain
 * expectations).
 */
function chain(
  months: string[],
  opts: ChainOpts = {},
): MonthlyProjection[] {
  const inflows = opts.inflows ?? 5000;
  const outflows = opts.outflows ?? 3000;
  const byCategory = opts.byCategory ?? { FOOD_AND_DRINK: 800 };
  let cash = opts.startCash ?? 1000;
  return months.map((month) => {
    const startCash = cash;
    cash = startCash + inflows - outflows;
    return {
      month,
      startCash,
      inflows,
      outflows,
      endCash: cash,
      byCategory: { ...byCategory },
      goalProgress: {},
    };
  });
}

const STREAMS: ForecastHistory['recurringStreams'] = [
  {
    id: 'rent-stream',
    label: 'Rent',
    amount: 1500,
    direction: 'outflow',
    cadence: 'monthly',
    nextDate: '2026-06-01',
  },
  {
    id: 'salary-stream',
    label: 'Salary',
    amount: 1000, // weekly → 1000 * 4.333 = 4333/mo
    direction: 'inflow',
    cadence: 'weekly',
    nextDate: '2026-06-07',
  },
];

// =============================================================================
// applyAdjustRecurring
// =============================================================================

describe('applyAdjustRecurring', () => {
  it('cancels an outflow stream (newAmount=0) — outflows drop by stream monthly equiv', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const result = applyAdjustRecurring(
      proj,
      {
        kind: 'adjust-recurring',
        streamId: 'rent-stream',
        startMonth: '2026-06',
        newAmount: 0,
      },
      STREAMS,
    );
    // Rent = 1500/mo. Each affected month's outflows: 3000 → 3000 - 1500 = 1500.
    expect(result[0].outflows).toBe(1500);
    expect(result[1].outflows).toBe(1500);
    expect(result[2].outflows).toBe(1500);
    // endCash chain rebuilds: each month gains $1500.
    expect(result[0].endCash).toBe(1000 + 5000 - 1500); // 4500
    expect(result[1].startCash).toBe(4500);
    expect(result[2].endCash).toBe(4500 + 2 * 3500); // 11500
  });

  it('raises an inflow stream (weekly cadence resolved to monthly)', () => {
    const proj = chain(['2026-06', '2026-07']);
    // Salary weekly $1000 → 4333/mo. Set newAmount=5333 → +$1000/mo delta.
    const result = applyAdjustRecurring(
      proj,
      {
        kind: 'adjust-recurring',
        streamId: 'salary-stream',
        startMonth: '2026-06',
        newAmount: 5333,
      },
      STREAMS,
    );
    expect(result[0].inflows).toBe(6000);
    expect(result[1].inflows).toBe(6000);
  });

  it('returns same-reference fast path when stream is unknown', () => {
    const proj = chain(['2026-06']);
    const result = applyAdjustRecurring(
      proj,
      {
        kind: 'adjust-recurring',
        streamId: 'no-such-stream',
        startMonth: '2026-06',
        newAmount: 999,
      },
      STREAMS,
    );
    expect(result).toBe(proj); // same reference
  });

  it('returns same-reference when newAmount equals current monthly equivalent', () => {
    const proj = chain(['2026-06']);
    // Rent monthly equiv = 1500. newAmount=1500 → delta=0 → no-op.
    const result = applyAdjustRecurring(
      proj,
      {
        kind: 'adjust-recurring',
        streamId: 'rent-stream',
        startMonth: '2026-06',
        newAmount: 1500,
      },
      STREAMS,
    );
    expect(result).toBe(proj);
  });

  it('respects endMonth window (months past endMonth unaffected)', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const result = applyAdjustRecurring(
      proj,
      {
        kind: 'adjust-recurring',
        streamId: 'rent-stream',
        startMonth: '2026-06',
        endMonth: '2026-06',
        newAmount: 0,
      },
      STREAMS,
    );
    expect(result[0].outflows).toBe(1500); // affected
    expect(result[1].outflows).toBe(3000); // outside window
    expect(result[2].outflows).toBe(3000);
  });
});

// =============================================================================
// applyReduceCategory
// =============================================================================

describe('applyReduceCategory', () => {
  it('reduces byCategory and outflows by deltaAmount over the window', () => {
    const proj = chain(['2026-06', '2026-07']);
    const result = applyReduceCategory(proj, {
      kind: 'reduce-category',
      categoryKey: 'FOOD_AND_DRINK',
      startMonth: '2026-06',
      deltaAmount: 100,
    });
    expect(result[0].byCategory.FOOD_AND_DRINK).toBe(700); // 800 - 100
    expect(result[0].outflows).toBe(2900); // 3000 - 100
    expect(result[1].byCategory.FOOD_AND_DRINK).toBe(700);
  });

  it('preserves signed math when reduction exceeds category baseline', () => {
    // SPEC + CLAUDE.md > "override appliers use signed math" — clampForDisplay
    // is the only clip point. Applier output may carry negative values that
    // surface real over-cut signal downstream.
    const proj = chain(['2026-06']);
    const result = applyReduceCategory(proj, {
      kind: 'reduce-category',
      categoryKey: 'FOOD_AND_DRINK',
      startMonth: '2026-06',
      deltaAmount: 1000, // > baseline 800
    });
    expect(result[0].byCategory.FOOD_AND_DRINK).toBe(-200); // signed!
    expect(result[0].outflows).toBe(2000);
  });

  it('untouched categories in the byCategory map are preserved', () => {
    const proj = chain(['2026-06'], {
      byCategory: { FOOD_AND_DRINK: 800, TRANSPORTATION: 200 },
    });
    const result = applyReduceCategory(proj, {
      kind: 'reduce-category',
      categoryKey: 'FOOD_AND_DRINK',
      startMonth: '2026-06',
      deltaAmount: 50,
    });
    expect(result[0].byCategory.TRANSPORTATION).toBe(200);
    expect(result[0].byCategory.FOOD_AND_DRINK).toBe(750);
  });
});

// =============================================================================
// applyIncomeEvent
// =============================================================================

describe('applyIncomeEvent', () => {
  it('applies a positive income delta over the window', () => {
    const proj = chain(['2026-06', '2026-07']);
    const result = applyIncomeEvent(proj, {
      kind: 'income-event',
      startMonth: '2026-06',
      monthlyAmount: 500,
    });
    expect(result[0].inflows).toBe(5500);
    expect(result[1].inflows).toBe(5500);
  });

  it('applies a negative income delta (job loss) — inflows can go negative', () => {
    // Signed math: a job loss of $6000/mo against baseline $5000 inflows
    // surfaces -$1000 inflows, which clampForDisplay reads as "over-projected
    // income loss." Applier preserves the signal.
    const proj = chain(['2026-06']);
    const result = applyIncomeEvent(proj, {
      kind: 'income-event',
      startMonth: '2026-06',
      monthlyAmount: -6000,
    });
    expect(result[0].inflows).toBe(-1000);
    expect(result[0].endCash).toBe(1000 + -1000 - 3000); // -3000
  });

  it('respects endMonth — months past endMonth unaffected', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const result = applyIncomeEvent(proj, {
      kind: 'income-event',
      startMonth: '2026-06',
      endMonth: '2026-06',
      monthlyAmount: 1000,
    });
    expect(result[0].inflows).toBe(6000);
    expect(result[1].inflows).toBe(5000); // outside window
    expect(result[2].inflows).toBe(5000);
  });
});

// =============================================================================
// applySkipOnce
// =============================================================================

describe('applySkipOnce', () => {
  it('skips a single outflow occurrence in the target month only', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const result = applySkipOnce(
      proj,
      { kind: 'skip-once', streamId: 'rent-stream', month: '2026-07' },
      STREAMS,
    );
    expect(result[0].outflows).toBe(3000); // unaffected
    expect(result[1].outflows).toBe(1500); // skipped: 3000 - 1500
    expect(result[2].outflows).toBe(3000);
    // Chain bump: month 1's endCash gains $1500, propagates forward.
    expect(result[1].endCash).toBe(result[0].endCash + 5000 - 1500);
    expect(result[2].startCash).toBe(result[1].endCash);
  });

  it('skips a single inflow occurrence (weekly stream → monthly equiv)', () => {
    const proj = chain(['2026-06']);
    const result = applySkipOnce(
      proj,
      { kind: 'skip-once', streamId: 'salary-stream', month: '2026-06' },
      STREAMS,
    );
    expect(result[0].inflows).toBeCloseTo(5000 - 4333, 0);
  });

  it('returns same-reference fast path when target month not in projection', () => {
    const proj = chain(['2026-06']);
    const result = applySkipOnce(
      proj,
      { kind: 'skip-once', streamId: 'rent-stream', month: '2030-12' },
      STREAMS,
    );
    expect(result).toBe(proj);
  });

  it('returns same-reference when streamId is unknown', () => {
    const proj = chain(['2026-06']);
    const result = applySkipOnce(
      proj,
      { kind: 'skip-once', streamId: 'no-such-stream', month: '2026-06' },
      STREAMS,
    );
    expect(result).toBe(proj);
  });
});
