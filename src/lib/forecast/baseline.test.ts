import { describe, expect, it } from 'vitest';
import { computeBaseline, median } from './baseline';
import type { ForecastHistory } from './types';

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the only value for a single-element array', () => {
    expect(median([100])).toBe(100);
  });

  it('returns the middle value for an odd-length array', () => {
    expect(median([1, 5, 3])).toBe(3);
  });

  it('returns the average of the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('ignores order — same result regardless of input order', () => {
    expect(median([10, 1, 5, 3, 8])).toBe(5);
  });
});

describe('computeBaseline', () => {
  const baseHistory: ForecastHistory = {
    currentCash: 10_000,
    recurringStreams: [],
    categoryHistory: {},
    incomeHistory: [],
    goals: [],
    categories: [],
  };

  it('returns a flat-cash projection when there is no history at all', () => {
    const result = computeBaseline(baseHistory, '2026-05', 3);
    expect(result).toHaveLength(3);
    expect(result[0].endCash).toBe(10_000);
    expect(result[1].endCash).toBe(10_000);
    expect(result[2].endCash).toBe(10_000);
  });

  it('projects category outflows using the trailing median', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      categoryHistory: { dining: [200, 800, 200] }, // median = 200, mean = 400
      categories: [{ id: 'dining', name: 'Dining' }],
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].outflows).toBe(200); // median, not mean — outlier 800 ignored
    expect(result[0].byCategory.dining).toBe(200);
    expect(result[0].endCash).toBe(9_800);
  });

  // Architecture B (closes C-01): recurring streams are NOT added to baseline
  // outflows separately — Plaid's PFC bucket already includes their cost.
  // The projection sees rent in `categoryHistory.RENT_AND_UTILITIES`, not in
  // an additive recurring layer. Tests of cadence multipliers live in
  // apply-overrides where they're functionally exercised by pause/edit/skip.
  it('does NOT separately add recurring outflows to baseline (Architecture B)', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      // Recurring stream is informational; not added to baseline outflow.
      recurringStreams: [
        { id: 's1', label: 'Rent', amount: 2000, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-01' },
      ],
      // Empty categoryHistory ⇒ baseline outflows = 0.
      categoryHistory: {},
    };
    const result = computeBaseline(history, '2026-05', 2);
    expect(result[0].outflows).toBe(0);
    expect(result[1].outflows).toBe(0);
  });

  it('uses median for income', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      incomeHistory: [500, 0, 500], // median = 500
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].inflows).toBe(500);
    expect(result[0].endCash).toBe(10_500);
  });

  it('chains startCash → endCash across months', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      currentCash: 5000,
      categoryHistory: { dining: [100, 100, 100] },
      categories: [{ id: 'dining', name: 'Dining' }],
    };
    const result = computeBaseline(history, '2026-05', 3);
    expect(result[0].startCash).toBe(5000);
    expect(result[0].endCash).toBe(4900);
    expect(result[1].startCash).toBe(4900);
    expect(result[1].endCash).toBe(4800);
    expect(result[2].startCash).toBe(4800);
    expect(result[2].endCash).toBe(4700);
  });

  // Conservation property test for review finding C-01 (Architecture B).
  // Without overrides, projected outflows over the horizon should be roughly
  // horizon × sum(category medians). The "stream subscription is also in PFC"
  // case must NOT double-count.
  it('projects total outflows within ±5% of trailing-3mo median × horizon', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      categoryHistory: {
        FOOD_AND_DRINK:        [800, 850, 820],          // ~$823/mo median
        RENT_AND_UTILITIES:    [2000, 2000, 2000],       // $2000/mo median
        SUBSCRIPTION:          [80, 80, 80],             // $80/mo
      },
      // Subscription also appears as a recurring stream — under Architecture B,
      // this MUST NOT cause the engine to double-count. Stream is informational.
      recurringStreams: [
        { id: 's1', label: 'Streaming', amount: 80, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-15' },
      ],
      categories: [
        { id: 'FOOD_AND_DRINK', name: 'Food and drink' },
        { id: 'RENT_AND_UTILITIES', name: 'Rent and utilities' },
        { id: 'SUBSCRIPTION', name: 'Subscription' },
      ],
    };
    const horizon = 12;
    const result = computeBaseline(history, '2026-05', horizon);
    const totalOutflows = result.reduce((s, m) => s + m.outflows, 0);
    const expected = horizon * (823 + 2000 + 80); // = 34,836
    expect(Math.abs(totalOutflows - expected) / expected).toBeLessThan(0.05);
  });
});
