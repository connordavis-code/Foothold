import { describe, expect, it } from 'vitest';
import { applyCategoryDeltas, applyIncomeDelta, applyRecurringChanges } from './apply-overrides';
import type { MonthlyProjection, ForecastHistory } from './types';

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

  it('does not produce negative outflows even with a large positive delta input mistake', () => {
    const proj = makeProjection(['2026-05']);
    const result = applyCategoryDeltas(proj, [
      { categoryId: 'dining', monthlyDelta: -500 }, // larger than baseline
    ]);
    // Outflow can't go below 0 for a category
    expect(result[0].byCategory.dining).toBe(0);
    expect(result[0].outflows).toBe(0);
    expect(result[0].endCash).toBe(1000);
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

  it('clamps inflows at 0 (income can never be negative)', () => {
    const proj = makeProjection(['2026-05']);
    const result = applyIncomeDelta(proj, { monthlyDelta: -10_000 });
    expect(result[0].inflows).toBe(0);
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
