import { describe, expect, it } from 'vitest';
import {
  applyCategoryDeltas,
  applyLumpSums,
  applyRecurringChanges,
  applySkipRecurringInstances,
  clampForDisplay,
} from './apply-overrides';
import type { ForecastHistory, MonthlyProjection } from './types';

/**
 * Regression tests for review finding W-09. After dropping in-chain
 * `Math.max(0, …)` clips, override appliers compose by accumulating SIGNED
 * deltas. Two consequences pinned by the tests below:
 *
 *   1. Order of application no longer matters mathematically — appliers
 *      commute over non-overlapping inputs, fixing the engine docstring's
 *      previously-false "no mathematical conflicts" claim.
 *
 *   2. Over-cut scenarios (delta magnitude exceeds baseline) preserve the
 *      slack as a negative value through the chain. A later applier can
 *      absorb it instead of the old code's silent round-to-zero. Display
 *      clamping happens once at engine output via clampForDisplay.
 */

function projection(
  month: string,
  base: { inflows: number; outflows: number; byCategory?: Record<string, number> },
): MonthlyProjection {
  return {
    month,
    startCash: 0,
    inflows: base.inflows,
    outflows: base.outflows,
    endCash: -base.outflows + base.inflows,
    byCategory: base.byCategory ?? {},
    goalProgress: {},
  };
}

function expectProjectionsClose(
  a: MonthlyProjection[],
  b: MonthlyProjection[],
): void {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i].month).toBe(b[i].month);
    expect(a[i].inflows).toBeCloseTo(b[i].inflows, 6);
    expect(a[i].outflows).toBeCloseTo(b[i].outflows, 6);
    expect(a[i].endCash).toBeCloseTo(b[i].endCash, 6);
    expect(a[i].byCategory).toEqual(b[i].byCategory);
  }
}

describe('over-cut + offset (W-09 review case)', () => {
  // The exact case from REVIEW.md § W-09:
  //   baseline inflows $5000. Pause $7000 stream + add $10000 lump sum
  //   in the same month → real signed answer = 5000 - 7000 + 10000 = 8000.
  //   Old code clipped pause to 0 then added 10000 → 10000 (wrong, off by 2000).
  it('over-pause + lump-sum produces signed-math result', () => {
    const proj = [projection('2026-06', { inflows: 5000, outflows: 0 })];
    const streams: ForecastHistory['recurringStreams'] = [
      {
        id: 'salary',
        label: 'Salary',
        amount: 7000,
        direction: 'inflow',
        cadence: 'monthly',
        nextDate: '2026-06-15',
      },
    ];

    let result = applyRecurringChanges(proj, streams, [
      { streamId: 'salary', action: 'pause' },
    ]);
    result = applyLumpSums(result, [
      { id: 'l', label: 'Bonus', amount: 10_000, month: '2026-06' },
    ]);

    expect(result[0].inflows).toBe(8000);
    expect(result[0].endCash).toBe(8000);
  });

  it('signed inflow is clamped at 0 for display when truly over-cut', () => {
    // Same pause without the offsetting lump sum — signed math leaves
    // inflows at -2000. Display clamps to 0; cash chain reflects -2000.
    const proj = [projection('2026-06', { inflows: 5000, outflows: 0 })];
    const streams: ForecastHistory['recurringStreams'] = [
      {
        id: 'salary',
        label: 'Salary',
        amount: 7000,
        direction: 'inflow',
        cadence: 'monthly',
        nextDate: '2026-06-15',
      },
    ];
    const signed = applyRecurringChanges(proj, streams, [
      { streamId: 'salary', action: 'pause' },
    ]);
    expect(signed[0].inflows).toBe(-2000);
    expect(signed[0].endCash).toBe(-2000);

    const display = clampForDisplay(signed);
    expect(display[0].inflows).toBe(0); // clamped
    expect(display[0].endCash).toBe(-2000); // unclamped — surfaces over-cut
  });

  it('over-cut category clamps for display but preserves cash math', () => {
    const proj = [
      projection('2026-06', {
        inflows: 0,
        outflows: 100,
        byCategory: { dining: 100 },
      }),
    ];
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -500 },
    ]);
    // Signed: dining = -400, outflows = -400, endCash = 0 - (-400) = 400.
    expect(result[0].byCategory.dining).toBe(-400);
    expect(result[0].outflows).toBe(-400);
    expect(result[0].endCash).toBe(400);

    const display = clampForDisplay(result);
    expect(display[0].byCategory.dining).toBe(0);
    expect(display[0].outflows).toBe(0);
    expect(display[0].endCash).toBe(400); // unclamped
  });
});

describe('commutativity', () => {
  it('applyCategoryDeltas + applyLumpSums commute', () => {
    const baseline = [
      projection('2026-06', {
        inflows: 1000,
        outflows: 500,
        byCategory: { dining: 500 },
      }),
    ];
    const deltas = [{ categoryId: 'dining', monthlyDelta: 200 }];
    const lumps = [
      { id: 'x', label: 'Bonus', amount: 100, month: '2026-06' },
    ];

    const aThenB = applyLumpSums(
      applyCategoryDeltas(baseline, deltas),
      lumps,
    );
    const bThenA = applyCategoryDeltas(
      applyLumpSums(baseline, lumps),
      deltas,
    );
    expectProjectionsClose(aThenB, bThenA);
  });

  it('applyRecurringChanges + applySkipRecurringInstances commute (non-overlapping)', () => {
    // pause stream A (months 06+07) + skip a different stream B in 06.
    // Non-overlapping: targets distinct streams + (for skip) one specific month.
    const baseline = [
      projection('2026-06', { inflows: 6000, outflows: 0 }),
      projection('2026-07', { inflows: 6000, outflows: 0 }),
    ];
    const streams: ForecastHistory['recurringStreams'] = [
      {
        id: 'A',
        label: 'A',
        amount: 1000,
        direction: 'inflow',
        cadence: 'monthly',
        nextDate: '2026-06-01',
      },
      {
        id: 'B',
        label: 'B',
        amount: 500,
        direction: 'inflow',
        cadence: 'monthly',
        nextDate: '2026-06-15',
      },
    ];
    const pause = [{ streamId: 'A', action: 'pause' as const }];
    const skip = [{ streamId: 'B', skipMonth: '2026-06' }];

    const aThenB = applySkipRecurringInstances(
      applyRecurringChanges(baseline, streams, pause),
      streams,
      skip,
    );
    const bThenA = applyRecurringChanges(
      applySkipRecurringInstances(baseline, streams, skip),
      streams,
      pause,
    );
    expectProjectionsClose(aThenB, bThenA);
  });

  it('all four signed appliers commute pairwise on non-overlapping inputs', () => {
    // Stress test: a category delta, an income delta (via incomeDelta-style
    // add lump sum to test similar shape), a recurring pause, and a skip.
    // Apply in two different orders and assert identical projection.
    const baseline = [
      projection('2026-06', {
        inflows: 6000,
        outflows: 800,
        byCategory: { food: 800 },
      }),
      projection('2026-07', {
        inflows: 6000,
        outflows: 800,
        byCategory: { food: 800 },
      }),
    ];
    const streams: ForecastHistory['recurringStreams'] = [
      {
        id: 'P',
        label: 'Pause-able',
        amount: 1000,
        direction: 'outflow',
        cadence: 'monthly',
        nextDate: '2026-06-01',
      },
      {
        id: 'S',
        label: 'Skippable',
        amount: 250,
        direction: 'outflow',
        cadence: 'monthly',
        nextDate: '2026-06-10',
      },
    ];
    const cat = [{ categoryId: 'food', monthlyDelta: -100 }];
    const lump = [
      { id: 'l', label: 'L', amount: 200, month: '2026-06' },
    ];
    const pause = [{ streamId: 'P', action: 'pause' as const }];
    const skip = [{ streamId: 'S', skipMonth: '2026-07' }];

    const order1 = applyLumpSums(
      applySkipRecurringInstances(
        applyRecurringChanges(
          applyCategoryDeltas(baseline, cat),
          streams,
          pause,
        ),
        streams,
        skip,
      ),
      lump,
    );
    const order2 = applyCategoryDeltas(
      applyRecurringChanges(
        applyLumpSums(
          applySkipRecurringInstances(baseline, streams, skip),
          lump,
        ),
        streams,
        pause,
      ),
      cat,
    );
    expectProjectionsClose(order1, order2);
  });
});

describe('clampForDisplay', () => {
  it('clamps negative inflows/outflows/byCategory at 0; preserves cash', () => {
    const proj = [
      {
        month: '2026-06',
        startCash: 1000,
        inflows: -500,
        outflows: -200,
        endCash: 700,
        byCategory: { food: -50, rent: 500 },
        goalProgress: {},
      },
    ];
    const result = clampForDisplay(proj);
    expect(result[0].inflows).toBe(0);
    expect(result[0].outflows).toBe(0);
    expect(result[0].byCategory).toEqual({ food: 0, rent: 500 });
    expect(result[0].startCash).toBe(1000); // unclamped
    expect(result[0].endCash).toBe(700); // unclamped
  });

  it('passes through non-negative values unchanged', () => {
    const proj = [
      {
        month: '2026-06',
        startCash: 1000,
        inflows: 500,
        outflows: 300,
        endCash: 1200,
        byCategory: { food: 300 },
        goalProgress: {},
      },
    ];
    const result = clampForDisplay(proj);
    expect(result[0]).toEqual(proj[0]);
  });

  it('does not mutate input projection', () => {
    const proj = [
      {
        month: '2026-06',
        startCash: 0,
        inflows: -10,
        outflows: 0,
        endCash: -10,
        byCategory: {},
        goalProgress: {},
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(proj));
    clampForDisplay(proj);
    expect(proj).toEqual(snapshot);
  });
});
