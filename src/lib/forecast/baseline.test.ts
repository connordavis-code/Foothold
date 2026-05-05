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
    nonRecurringIncomeHistory: [],
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

  it('projects recurring monthly outflow streams as-is', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      recurringStreams: [
        {
          id: 's1',
          label: 'Rent',
          amount: 2000,
          direction: 'outflow',
          cadence: 'monthly',
          nextDate: '2026-05-01',
        },
      ],
    };
    const result = computeBaseline(history, '2026-05', 2);
    expect(result[0].outflows).toBe(2000);
    expect(result[1].outflows).toBe(2000);
  });

  it('uses median for non-recurring income too', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      nonRecurringIncomeHistory: [500, 0, 500], // median = 500
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

  it('scales weekly recurring outflow streams by ~4.333×', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      recurringStreams: [
        { id: 's1', label: 'Coffee', amount: 30, direction: 'outflow', cadence: 'weekly', nextDate: '2026-05-07' },
      ],
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].outflows).toBeCloseTo(30 * 4.333, 2);
  });

  it('scales biweekly recurring inflow streams by ~2.167×', () => {
    const history: ForecastHistory = {
      ...baseHistory,
      recurringStreams: [
        { id: 's1', label: 'Paycheck', amount: 1500, direction: 'inflow', cadence: 'biweekly', nextDate: '2026-05-15' },
      ],
    };
    const result = computeBaseline(history, '2026-05', 1);
    expect(result[0].inflows).toBeCloseTo(1500 * 2.167, 2);
  });
});
