import { describe, expect, it } from 'vitest';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { hikeRatio, isHikeAlert, monthlyCost } from './analysis';

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

