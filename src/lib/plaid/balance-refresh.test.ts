import { describe, expect, it } from 'vitest';
import {
  buildBalanceUpdate,
  selectRefreshableAccounts,
} from './balance-refresh';

describe('selectRefreshableAccounts', () => {
  // Plaid's accountsBalanceGet does not meaningfully refresh investment
  // balances (those flow through holdings sync) and 4xxs on items where
  // the request shape can't be satisfied. Filtering before the API call
  // is defensively correct regardless of the upstream error code.
  it('keeps depository accounts', () => {
    const accounts = [
      { providerAccountId: 'a1', type: 'depository' },
      { providerAccountId: 'a2', type: 'depository' },
    ];
    expect(selectRefreshableAccounts(accounts)).toEqual(accounts);
  });

  it('keeps credit accounts', () => {
    const accounts = [{ providerAccountId: 'c1', type: 'credit' }];
    expect(selectRefreshableAccounts(accounts)).toEqual(accounts);
  });

  it('drops investment accounts', () => {
    const accounts = [
      { providerAccountId: 'd1', type: 'depository' },
      { providerAccountId: 'i1', type: 'investment' },
    ];
    expect(selectRefreshableAccounts(accounts)).toEqual([
      { providerAccountId: 'd1', type: 'depository' },
    ]);
  });

  it('drops loan and other types', () => {
    const accounts = [
      { providerAccountId: 'l1', type: 'loan' },
      { providerAccountId: 'o1', type: 'other' },
      { providerAccountId: 'c1', type: 'credit' },
    ];
    expect(selectRefreshableAccounts(accounts)).toEqual([
      { providerAccountId: 'c1', type: 'credit' },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(selectRefreshableAccounts([])).toEqual([]);
  });

  it('returns empty when no account is refreshable', () => {
    const accounts = [
      { providerAccountId: 'i1', type: 'investment' },
      { providerAccountId: 'l1', type: 'loan' },
    ];
    expect(selectRefreshableAccounts(accounts)).toEqual([]);
  });

  it('preserves input order on mixed types', () => {
    const accounts = [
      { providerAccountId: 'c1', type: 'credit' },
      { providerAccountId: 'i1', type: 'investment' },
      { providerAccountId: 'd1', type: 'depository' },
      { providerAccountId: 'd2', type: 'depository' },
    ];
    expect(selectRefreshableAccounts(accounts)).toEqual([
      { providerAccountId: 'c1', type: 'credit' },
      { providerAccountId: 'd1', type: 'depository' },
      { providerAccountId: 'd2', type: 'depository' },
    ]);
  });
});

describe('buildBalanceUpdate', () => {
  it('includes both fields when both balances are non-null', () => {
    expect(
      buildBalanceUpdate({ current: 1234.56, available: 1000 }),
    ).toEqual({
      currentBalance: '1234.56',
      availableBalance: '1000',
    });
  });

  // Regression: bare UPDATE used to write currentBalance=null straight
  // over real values when Plaid omitted current. Read surfaces treat
  // null as zero (dashboard summary, forecast cash, savings goal
  // progress), so this looked like a healthy refresh while silently
  // understating cash on the headline.
  it('omits currentBalance when Plaid returns current === null', () => {
    expect(buildBalanceUpdate({ current: null, available: 750 })).toEqual({
      availableBalance: '750',
    });
  });

  // Common case for credit cards — Plaid omits available because the
  // semantic doesn't apply the same way it does for depository.
  it('omits availableBalance when Plaid returns available === null', () => {
    expect(buildBalanceUpdate({ current: 2500, available: null })).toEqual({
      currentBalance: '2500',
    });
  });

  it('returns empty object when both balances are null', () => {
    expect(
      buildBalanceUpdate({ current: null, available: null }),
    ).toEqual({});
  });

  // Zero is a legitimate balance (paid-off card, drained account) and
  // must not be conflated with null. The `!= null` check distinguishes
  // them; a truthy check would silently drop these.
  it('treats zero as a real value, not null', () => {
    expect(buildBalanceUpdate({ current: 0, available: 0 })).toEqual({
      currentBalance: '0',
      availableBalance: '0',
    });
  });

  it('treats undefined like null (omits the field)', () => {
    expect(
      buildBalanceUpdate({ current: undefined, available: 100 }),
    ).toEqual({
      availableBalance: '100',
    });
  });
});
