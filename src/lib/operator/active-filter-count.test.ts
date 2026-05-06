import { describe, expect, it } from 'vitest';
import { activeTransactionFilterCount } from './active-filter-count';

describe('activeTransactionFilterCount', () => {
  it('returns 0 for an empty params object', () => {
    expect(activeTransactionFilterCount({})).toBe(0);
  });

  it('counts each present, non-empty filter key', () => {
    expect(
      activeTransactionFilterCount({
        account: 'acc-1',
        category: 'FOOD_AND_DRINK',
        from: '2026-04-01',
      }),
    ).toBe(3);
  });

  it('ignores empty strings and null/undefined', () => {
    expect(
      activeTransactionFilterCount({
        account: '',
        category: undefined,
        from: null,
        q: 'starbucks',
      }),
    ).toBe(1);
  });

  it('ignores unknown keys', () => {
    expect(
      activeTransactionFilterCount({
        account: 'a',
        page: '5',
        sort: 'desc',
      }),
    ).toBe(1);
  });
});
