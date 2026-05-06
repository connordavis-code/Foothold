import { describe, expect, it } from 'vitest';
import { mapStreamCadenceAndAmount } from './forecast';

// Regression tests for review finding W-10. SEMI_MONTHLY and ANNUALLY
// have no slot in the engine's cadence enum, so they collapse to
// 'monthly' — but the amount must be rescaled to the true monthly
// equivalent or projections are off by 50% / 12x.
describe('mapStreamCadenceAndAmount', () => {
  it('preserves WEEKLY: per-week amount, weekly cadence', () => {
    expect(mapStreamCadenceAndAmount(50, 'WEEKLY')).toEqual({
      amount: 50,
      cadence: 'weekly',
    });
  });

  it('preserves BIWEEKLY: per-biweek amount, biweekly cadence', () => {
    expect(mapStreamCadenceAndAmount(2000, 'BIWEEKLY')).toEqual({
      amount: 2000,
      cadence: 'biweekly',
    });
  });

  it('preserves MONTHLY: per-month amount, monthly cadence', () => {
    expect(mapStreamCadenceAndAmount(100, 'MONTHLY')).toEqual({
      amount: 100,
      cadence: 'monthly',
    });
  });

  it('rescales SEMI_MONTHLY: $1500 per occurrence × 2 = $3000/mo', () => {
    expect(mapStreamCadenceAndAmount(1500, 'SEMI_MONTHLY')).toEqual({
      amount: 3000,
      cadence: 'monthly',
    });
  });

  it('rescales ANNUALLY: $1200/yr ÷ 12 = $100/mo', () => {
    expect(mapStreamCadenceAndAmount(1200, 'ANNUALLY')).toEqual({
      amount: 100,
      cadence: 'monthly',
    });
  });

  it('treats UNKNOWN as monthly (defensible default)', () => {
    expect(mapStreamCadenceAndAmount(50, 'UNKNOWN')).toEqual({
      amount: 50,
      cadence: 'monthly',
    });
  });

  it('treats null frequency as monthly', () => {
    expect(mapStreamCadenceAndAmount(50, null)).toEqual({
      amount: 50,
      cadence: 'monthly',
    });
  });

  it('handles lowercase input via uppercase normalization', () => {
    expect(mapStreamCadenceAndAmount(50, 'weekly')).toEqual({
      amount: 50,
      cadence: 'weekly',
    });
  });
});
