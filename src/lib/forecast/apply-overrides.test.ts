import { describe, expect, it } from 'vitest';
import {
  applyCategoryDeltas,
  applyIncomeDelta,
  applyLumpSums,
  applyRecurringChanges,
  applySkipRecurringInstances,
  clampForDisplay,
} from './apply-overrides';
import type { ForecastHistory, MonthlyProjection } from './types';

function makeProjection(months: string[]): MonthlyProjection[] {
  return months.map((month) => ({
    month,
    startCash: 1000,
    inflows: 0,
    outflows: 100,
    endCash: 900,
    byCategory: { dining: 100 },
    goalProgress: {},
  }));
}

describe('applyCategoryDeltas', () => {
  it('returns input unchanged (same reference) when no deltas are provided', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, undefined);
    expect(result).toBe(proj);
  });

  it('reduces a category outflow by the delta amount across all months by default', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50 },
    ]);
    expect(result[0].byCategory.dining).toBe(50);
    expect(result[0].outflows).toBe(50);
    expect(result[0].endCash).toBe(950);
    expect(result[1].byCategory.dining).toBe(50);
    expect(result[1].endCash).toBe(900); // chained: startCash=950 (from month 0) + 0 - 50 = 900
  });

  it('respects startMonth — delta only applies from startMonth forward', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, startMonth: '2026-06' },
    ]);
    expect(result[0].byCategory.dining).toBe(100); // unchanged
    expect(result[1].byCategory.dining).toBe(50);  // applied
    expect(result[2].byCategory.dining).toBe(50);  // applied
  });

  it('respects endMonth — delta does not apply past endMonth', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, endMonth: '2026-06' },
    ]);
    expect(result[0].byCategory.dining).toBe(50);  // applied
    expect(result[1].byCategory.dining).toBe(50);  // applied
    expect(result[2].byCategory.dining).toBe(100); // unchanged
  });

  it('chains endCash forward correctly when delta applied mid-horizon', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -50, startMonth: '2026-06' },
    ]);
    // Month 0: outflow stays 100, endCash 900
    // Month 1: outflow 50, but startCash should chain from month 0 endCash (900)
    //   then 900 + 0 - 50 = 850
    // Month 2: 850 + 0 - 50 = 800
    expect(result[0].endCash).toBe(900);
    expect(result[1].startCash).toBe(900);
    expect(result[1].endCash).toBe(850);
    expect(result[2].startCash).toBe(850);
    expect(result[2].endCash).toBe(800);
  });

  it('produces signed (negative) outflows when delta exceeds baseline (W-09)', () => {
    // Closes review W-09: the applier no longer clips per-step. A delta of
    // -500 against a $100 baseline yields signed -400 in byCategory + outflows.
    // Cash math reflects this: endCash = 1000 + 0 - (-400) = 1400. Display
    // clamping is a separate step (clampForDisplay).
    const proj = makeProjection(['2026-05']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -500 }, // larger than baseline
    ]);
    expect(result[0].byCategory.dining).toBe(-400);
    expect(result[0].outflows).toBe(-400);
    expect(result[0].endCash).toBe(1400);

    // clampForDisplay clips display fields at 0 but preserves cash math:
    // displayed inflows: 0, outflows: 0, but endCash still 1400.
    const display = clampForDisplay(result);
    expect(display[0].byCategory.dining).toBe(0);
    expect(display[0].outflows).toBe(0);
    expect(display[0].endCash).toBe(1400); // cash unclamped — reflects real math
  });

  it('increases outflow and decreases endCash for a positive delta', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: 200 },
    ]);
    // Month 0: byCategory.dining 100 → 300, outflows 100 → 300, endCash 1000 + 0 - 300 = 700
    expect(result[0].byCategory.dining).toBe(300);
    expect(result[0].outflows).toBe(300);
    expect(result[0].endCash).toBe(700);
    // Month 1 chains: startCash = 700 (from month 0 endCash), endCash = 700 + 0 - 300 = 400
    expect(result[1].startCash).toBe(700);
    expect(result[1].endCash).toBe(400);
  });

  it('returns an empty array unchanged when projection is empty', () => {
    const result = applyCategoryDeltas([], [
      { categoryId: 'dining', monthlyDelta: -50 },
    ]);
    expect(result).toEqual([]);
  });

  it('applies multiple deltas on the same category cumulatively', () => {
    const proj = makeProjection(['2026-05']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: 50 },   // 100 → 150
      { categoryId: 'dining', monthlyDelta: -30 },  // 150 → 120
    ]);
    expect(result[0].byCategory.dining).toBe(120);
    expect(result[0].outflows).toBe(120);
  });
});

const baseStreams: ForecastHistory['recurringStreams'] = [
  { id: 'rent', label: 'Rent', amount: 2000, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-01' },
  { id: 'salary', label: 'Salary', amount: 5000, direction: 'inflow', cadence: 'monthly', nextDate: '2026-05-15' },
];

describe('applyRecurringChanges', () => {
  it('returns input unchanged (same reference) when no changes', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyRecurringChanges(proj, baseStreams, undefined)).toBe(proj);
  });

  it('pause action: removes a stream from all months', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'pause' },
    ]);
    expect(result[0].outflows).toBe(0);
    expect(result[0].endCash).toBe(6000);
  });

  it('edit action: modifies amount on a stream', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'edit', amount: 1800 },
    ]);
    expect(result[0].outflows).toBe(1800);
  });

  it('add action: adds a hypothetical stream', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      {
        action: 'add',
        label: 'Gym',
        amount: 200,
        direction: 'outflow',
        cadence: 'monthly',
      },
    ]);
    expect(result[0].outflows).toBe(2200);
    expect(result[0].endCash).toBe(3800);
  });

  it('respects startMonth on pause/edit', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
      { month: '2026-06', startCash: 4000, inflows: 5000, outflows: 2000, endCash: 7000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'pause', startMonth: '2026-06' },
    ]);
    expect(result[0].outflows).toBe(2000); // unchanged in May
    expect(result[1].outflows).toBe(0);    // paused June
  });

  it('chains endCash forward when a pause spans multiple months', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
      { month: '2026-06', startCash: 4000, inflows: 5000, outflows: 2000, endCash: 7000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'pause' },
    ]);
    // Month 0: outflows 0, endCash 1000 + 5000 - 0 = 6000
    expect(result[0].endCash).toBe(6000);
    // Month 1 chains: startCash 6000, outflows 0, endCash 6000 + 5000 - 0 = 11000
    expect(result[1].startCash).toBe(6000);
    expect(result[1].endCash).toBe(11000);
  });

  it('returns empty array unchanged when projection is empty', () => {
    const result = applyRecurringChanges([], baseStreams, [
      { streamId: 'rent', action: 'pause' },
    ]);
    expect(result).toEqual([]);
  });

  it('handles weekly/biweekly cadence with monthly equivalent', () => {
    // baseline projection assumed monthly equivalents already computed.
    // Adding a weekly $100 outflow should add ~433.3/mo.
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { action: 'add', label: 'Coffee', amount: 100, direction: 'outflow', cadence: 'weekly' },
    ]);
    expect(result[0].outflows).toBeCloseTo(433.3, 1);
  });

  it('pause action on an inflow stream removes it from inflows', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'salary', action: 'pause' },
    ]);
    // Salary (5000 monthly inflow) removed → inflows 0
    expect(result[0].inflows).toBe(0);
    expect(result[0].outflows).toBe(2000);
    expect(result[0].endCash).toBe(-1000); // 1000 + 0 - 2000; engine intentionally allows negative endCash
  });

  it('edit action that flips direction (outflow → inflow)', () => {
    // Originally rent is a 2000 outflow. Edit to "rebate" inflow of 2000.
    const proj: MonthlyProjection[] = [
      { month: '2026-05', startCash: 1000, inflows: 5000, outflows: 2000, endCash: 4000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyRecurringChanges(proj, baseStreams, [
      { streamId: 'rent', action: 'edit', direction: 'inflow', amount: 2000 },
    ]);
    // Original 2000 removed from outflows → outflows 0
    expect(result[0].outflows).toBe(0);
    // New 2000 added to inflows → inflows 7000
    expect(result[0].inflows).toBe(7000);
    expect(result[0].endCash).toBe(8000); // 1000 + 7000 - 0
  });
});

describe('applyIncomeDelta', () => {
  it('returns input unchanged when no income delta', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyIncomeDelta(proj, undefined)).toBe(proj);
  });

  it('adds positive monthlyDelta to inflows for all months by default', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyIncomeDelta(proj, { monthlyDelta: 500 });
    expect(result[0].inflows).toBe(500);
    // Month 0: 1000 + 500 - 100 = 1400
    expect(result[0].endCash).toBe(1400);
    expect(result[1].inflows).toBe(500);
    // Month 1 chains: startCash 1400, endCash 1400 + 500 - 100 = 1800
    expect(result[1].startCash).toBe(1400);
    expect(result[1].endCash).toBe(1800);
  });

  it('subtracts negative monthlyDelta from inflows (income drop)', () => {
    const proj = makeProjection(['2026-05']);
    const withIncome = proj.map((m) => ({ ...m, inflows: 1000, endCash: 1900 }));
    const result = applyIncomeDelta(withIncome, { monthlyDelta: -300 });
    expect(result[0].inflows).toBe(700);
    expect(result[0].endCash).toBe(1600); // 1000 + 700 - 100
  });

  it('respects startMonth/endMonth bounds', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyIncomeDelta(proj, {
      monthlyDelta: 500,
      startMonth: '2026-06',
      endMonth: '2026-06',
    });
    expect(result[0].inflows).toBe(0);
    expect(result[1].inflows).toBe(500);
    expect(result[2].inflows).toBe(0);
  });

  it('produces signed (negative) inflows when delta exceeds baseline (W-09)', () => {
    // Closes review W-09: signed math at applier level. clampForDisplay
    // clips for rendering; the applier preserves the over-cut signal so a
    // later applier (e.g. lump-sum inflow) can absorb it.
    const proj = makeProjection(['2026-05']);
    const result = applyIncomeDelta(proj, { monthlyDelta: -10_000 });
    expect(result[0].inflows).toBe(-10_000);

    // After display clamp, inflows reads as 0 but endCash reflects the
    // signed math: startCash 1000 + (-10000) - 100 outflow = -9100.
    const display = clampForDisplay(result);
    expect(display[0].inflows).toBe(0);
    expect(display[0].endCash).toBe(-9_100);
  });

  it('returns an empty array unchanged for empty projection', () => {
    const result = applyIncomeDelta([], { monthlyDelta: 500 });
    expect(result).toEqual([]);
  });

  it('chains endCash correctly across a bounded range', () => {
    const proj = makeProjection(['2026-05', '2026-06', '2026-07']);
    const result = applyIncomeDelta(proj, {
      monthlyDelta: 500,
      startMonth: '2026-06',
      endMonth: '2026-06',
    });
    // Month 0 (out of range): 1000 + 0 - 100 = 900
    expect(result[0].endCash).toBe(900);
    // Month 1 (in range): startCash 900, inflows 500, outflows 100 → 1300
    expect(result[1].startCash).toBe(900);
    expect(result[1].endCash).toBe(1300);
    // Month 2 (out of range again): startCash 1300, inflows 0 → 1200
    expect(result[2].startCash).toBe(1300);
    expect(result[2].endCash).toBe(1200);
  });
});

describe('applySkipRecurringInstances', () => {
  it('returns input unchanged (same reference) when no skips', () => {
    const proj = makeProjection(['2026-05']);
    expect(applySkipRecurringInstances(proj, baseStreams, undefined)).toBe(proj);
  });

  it('subtracts a one-time outflow stream instance from the specified month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'rent', skipMonth: '2026-08' },
    ]);
    expect(result[0].outflows).toBe(0); // Rent skipped — 2000 monthly equivalent removed
    expect(result[0].endCash).toBe(5000);
  });

  it('does not affect other months', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
      { month: '2026-09', startCash: 3000, inflows: 0, outflows: 2000, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'rent', skipMonth: '2026-08' },
    ]);
    expect(result[1].outflows).toBe(2000); // unchanged
    expect(result[1].startCash).toBe(5000); // chain forward from skipped month's new endCash
    expect(result[1].endCash).toBe(3000);
  });

  it('handles inflow stream skips (e.g. skipping a paycheck)', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 5000, outflows: 0, endCash: 10000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'salary', skipMonth: '2026-08' },
    ]);
    expect(result[0].inflows).toBe(0);
    expect(result[0].endCash).toBe(5000);
  });

  it('returns empty array unchanged for empty projection', () => {
    const result = applySkipRecurringInstances([], baseStreams, [
      { streamId: 'rent', skipMonth: '2026-08' },
    ]);
    expect(result).toEqual([]);
  });

  it('silently ignores unknown streamId (returns same reference)', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'nonexistent', skipMonth: '2026-08' },
    ]);
    // Fast path: all-miss returns input reference, not a copy.
    expect(result).toBe(proj);
  });

  it('returns same reference when no skip targets a month in the projection', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 2000, endCash: 3000, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, baseStreams, [
      { streamId: 'rent', skipMonth: '2030-01' }, // out of horizon
    ]);
    expect(result).toBe(proj);
  });

  it('skips a weekly recurring stream by its monthly equivalent (~$69.32 for $16/wk)', () => {
    const weeklyStreams: ForecastHistory['recurringStreams'] = [
      { id: 'netflix', label: 'Netflix', amount: 16, direction: 'outflow', cadence: 'weekly', nextDate: '2026-08-01' },
    ];
    const proj: MonthlyProjection[] = [
      { month: '2026-08', startCash: 5000, inflows: 0, outflows: 100, endCash: 4900, byCategory: {}, goalProgress: {} },
    ];
    const result = applySkipRecurringInstances(proj, weeklyStreams, [
      { streamId: 'netflix', skipMonth: '2026-08' },
    ]);
    // Weekly $16 × 4.333 = $69.328 monthly equivalent removed
    expect(result[0].outflows).toBeCloseTo(100 - 69.328, 2);
    expect(result[0].endCash).toBeCloseTo(5000 - (100 - 69.328), 2);
  });
});

describe('applyLumpSums', () => {
  it('returns input unchanged (same reference) when no lump sums', () => {
    const proj = makeProjection(['2026-05']);
    expect(applyLumpSums(proj, undefined)).toBe(proj);
  });

  it('adds positive amount to inflows in the target month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' },
    ]);
    expect(result[0].inflows).toBe(2400);
    expect(result[0].endCash).toBe(3400);
  });

  it('adds negative amount to outflows in the target month', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'vet', label: 'Vet bill', amount: -800, month: '2026-04' },
    ]);
    expect(result[0].outflows).toBe(800);
    expect(result[0].endCash).toBe(200);
  });

  it('ignores lump sums outside the projection range (returns same reference)', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'far-future', label: 'Bonus', amount: 10000, month: '2030-01' },
    ]);
    // Fast path: no matching month → input reference returned.
    expect(result).toBe(proj);
  });

  it('chains endCash through subsequent months after a lump sum', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
      { month: '2026-05', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' },
    ]);
    expect(result[0].endCash).toBe(3400);
    expect(result[1].startCash).toBe(3400);
    expect(result[1].endCash).toBe(3400);
  });

  it('returns empty array unchanged for empty projection', () => {
    const result = applyLumpSums([], [
      { id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' },
    ]);
    expect(result).toEqual([]);
  });

  it('applies multiple lump sums in the same month cumulatively', () => {
    const proj: MonthlyProjection[] = [
      { month: '2026-04', startCash: 1000, inflows: 0, outflows: 0, endCash: 1000, byCategory: {}, goalProgress: {} },
    ];
    const result = applyLumpSums(proj, [
      { id: 'a', label: 'Bonus', amount: 500, month: '2026-04' },
      { id: 'b', label: 'Refund', amount: 300, month: '2026-04' },
      { id: 'c', label: 'Bill', amount: -100, month: '2026-04' },
    ]);
    expect(result[0].inflows).toBe(800);
    expect(result[0].outflows).toBe(100);
    expect(result[0].endCash).toBe(1700); // 1000 + 800 - 100
  });
});
