import { describe, expect, it } from 'vitest';
import { applyCategoryDeltas } from './apply-overrides';
import type { MonthlyProjection } from './types';

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
  it('returns input unchanged when no deltas are provided', () => {
    const proj = makeProjection(['2026-05', '2026-06']);
    const result = applyCategoryDeltas(proj, undefined);
    expect(result).toEqual(proj);
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
});
