import { describe, expect, it } from 'vitest';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import {
  groupByCategory,
  hikeRatio,
  isHikeAlert,
  monthlyCost,
} from './analysis';

function makeStream(
  o: Partial<RecurringStreamRow> = {},
): RecurringStreamRow {
  return {
    id: 's',
    plaidStreamId: 'p',
    direction: 'outflow',
    description: null,
    merchantName: 'Test',
    frequency: 'MONTHLY',
    averageAmount: 10,
    lastAmount: 10,
    firstDate: '2024-01-01',
    lastDate: '2026-04-15',
    predictedNextDate: '2026-05-15',
    isActive: true,
    status: 'MATURE',
    primaryCategory: 'ENTERTAINMENT',
    accountName: 'Checking',
    accountMask: '1234',
    ...o,
  };
}

describe('hikeRatio', () => {
  it('returns null when averageAmount is null', () => {
    expect(hikeRatio(makeStream({ averageAmount: null }))).toBeNull();
  });

  it('returns null when lastAmount is null', () => {
    expect(hikeRatio(makeStream({ lastAmount: null }))).toBeNull();
  });

  it('returns null when averageAmount is zero (avoids div-by-zero)', () => {
    expect(hikeRatio(makeStream({ averageAmount: 0, lastAmount: 5 }))).toBeNull();
  });

  it('returns null for inflow streams (hike concept is outflow-only)', () => {
    expect(
      hikeRatio(makeStream({ direction: 'inflow', averageAmount: 15, lastAmount: 20 })),
    ).toBeNull();
  });

  it('returns null for inactive streams', () => {
    expect(
      hikeRatio(makeStream({ isActive: false, averageAmount: 15, lastAmount: 20 })),
    ).toBeNull();
  });

  it('returns positive ratio when last is higher than average', () => {
    const r = hikeRatio(makeStream({ averageAmount: 15, lastAmount: 20 }));
    expect(r).toBeCloseTo((20 - 15) / 15, 5);
  });

  it('returns negative ratio when last is lower than average', () => {
    const r = hikeRatio(makeStream({ averageAmount: 15, lastAmount: 10 }));
    expect(r).toBeCloseTo((10 - 15) / 15, 5);
  });
});

describe('isHikeAlert', () => {
  it('returns true when ratio > 15% AND monthly delta >= $2', () => {
    expect(
      isHikeAlert(
        makeStream({ frequency: 'MONTHLY', averageAmount: 15, lastAmount: 20 }),
      ),
    ).toBe(true);
  });

  it('returns false below the 15% ratio threshold', () => {
    expect(
      isHikeAlert(
        makeStream({ frequency: 'MONTHLY', averageAmount: 100, lastAmount: 110 }),
      ),
    ).toBe(false);
  });

  it('returns false when ratio is large but absolute monthly delta is below $2 floor', () => {
    expect(
      isHikeAlert(
        makeStream({ frequency: 'MONTHLY', averageAmount: 0.1, lastAmount: 0.5 }),
      ),
    ).toBe(false);
  });

  it('returns false for negative ratios (smaller-than-usual is not a hike)', () => {
    expect(
      isHikeAlert(
        makeStream({ frequency: 'MONTHLY', averageAmount: 20, lastAmount: 10 }),
      ),
    ).toBe(false);
  });

  it('returns false when hikeRatio is null', () => {
    expect(isHikeAlert(makeStream({ averageAmount: null }))).toBe(false);
  });

  it('respects WEEKLY frequency when computing the absolute floor', () => {
    // last - avg = 1.50 weekly; weekly→monthly = 1.50 * 52/12 ≈ 6.50, above $2 floor
    expect(
      isHikeAlert(
        makeStream({ frequency: 'WEEKLY', averageAmount: 5, lastAmount: 6.5 }),
      ),
    ).toBe(true);
  });
});

describe('monthlyCost', () => {
  it('treats MONTHLY as 1×', () => {
    expect(monthlyCost(makeStream({ frequency: 'MONTHLY', averageAmount: 50 }))).toBe(50);
  });

  it('annualizes WEEKLY by 52/12', () => {
    expect(
      monthlyCost(makeStream({ frequency: 'WEEKLY', averageAmount: 12 })),
    ).toBeCloseTo(12 * (52 / 12), 5);
  });

  it('annualizes BIWEEKLY by 26/12', () => {
    expect(
      monthlyCost(makeStream({ frequency: 'BIWEEKLY', averageAmount: 12 })),
    ).toBeCloseTo(12 * (26 / 12), 5);
  });

  it('treats SEMI_MONTHLY as 2×', () => {
    expect(
      monthlyCost(makeStream({ frequency: 'SEMI_MONTHLY', averageAmount: 50 })),
    ).toBe(100);
  });

  it('treats ANNUALLY as 1/12', () => {
    expect(
      monthlyCost(makeStream({ frequency: 'ANNUALLY', averageAmount: 1200 })),
    ).toBeCloseTo(100, 5);
  });

  it('returns 0 when averageAmount is null', () => {
    expect(monthlyCost(makeStream({ averageAmount: null }))).toBe(0);
  });

  it('takes absolute value (Plaid sandbox sometimes reports negative on outflows)', () => {
    expect(
      monthlyCost(makeStream({ frequency: 'MONTHLY', averageAmount: -50 })),
    ).toBe(50);
  });
});

describe('groupByCategory', () => {
  const a = makeStream({
    id: 'a',
    primaryCategory: 'ENTERTAINMENT',
    averageAmount: 20,
  });
  const b = makeStream({
    id: 'b',
    primaryCategory: 'ENTERTAINMENT',
    averageAmount: 10,
  });
  const c = makeStream({
    id: 'c',
    primaryCategory: 'RENT_AND_UTILITIES',
    averageAmount: 2400,
  });
  const d = makeStream({
    id: 'd',
    primaryCategory: null,
    averageAmount: 5,
  });
  const inflow = makeStream({
    id: 'in',
    direction: 'inflow',
    primaryCategory: 'INCOME',
    averageAmount: 7500,
  });
  const inactive = makeStream({
    id: 'cancelled',
    isActive: false,
    primaryCategory: 'ENTERTAINMENT',
    averageAmount: 100,
  });

  it('groups outflow streams by primaryCategory', () => {
    const groups = groupByCategory([a, b, c]);
    const keys = groups.map((g) => g.category);
    expect(new Set(keys)).toEqual(new Set(['ENTERTAINMENT', 'RENT_AND_UTILITIES']));
  });

  it('sorts streams within each group by monthlyCost desc', () => {
    const groups = groupByCategory([b, a]);
    const ent = groups.find((g) => g.category === 'ENTERTAINMENT');
    expect(ent?.streams.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('sorts groups across by total monthlyCost desc', () => {
    const groups = groupByCategory([a, b, c]);
    expect(groups.map((g) => g.category)).toEqual([
      'RENT_AND_UTILITIES',
      'ENTERTAINMENT',
    ]);
  });

  it('places null-category streams in an "Other" bucket pinned to the bottom', () => {
    const groups = groupByCategory([a, c, d]);
    expect(groups[groups.length - 1].category).toBeNull();
  });

  it('keeps "Other" at the bottom even when its total exceeds another category', () => {
    const big = makeStream({ id: 'big', primaryCategory: null, averageAmount: 99999 });
    const groups = groupByCategory([a, c, big]);
    expect(groups[groups.length - 1].category).toBeNull();
  });

  it('excludes inflow streams', () => {
    const groups = groupByCategory([a, inflow]);
    const allIds = groups.flatMap((g) => g.streams.map((s) => s.id));
    expect(allIds).not.toContain('in');
  });

  it('excludes inactive streams', () => {
    const groups = groupByCategory([a, inactive]);
    const allIds = groups.flatMap((g) => g.streams.map((s) => s.id));
    expect(allIds).not.toContain('cancelled');
  });

  it('exposes per-group total monthlyCost', () => {
    const groups = groupByCategory([a, b, c]);
    const ent = groups.find((g) => g.category === 'ENTERTAINMENT');
    expect(ent?.total).toBe(30);
  });
});
