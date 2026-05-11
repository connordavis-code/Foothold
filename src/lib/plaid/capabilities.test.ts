import { describe, expect, it } from 'vitest';
import { hasInvestmentAccounts } from './capabilities';

// Cost-control regression: syncInvestmentsForItem early-returns when this
// predicate is false, skipping the paid investmentsHoldingsGet +
// investmentsTransactionsGet calls. If a refactor accidentally drops the
// gate, the Plaid bill silently grows for every credit-only or
// depository-only Plaid item. Lock the predicate's behavior here.
describe('hasInvestmentAccounts', () => {
  it('returns false for an empty account list', () => {
    expect(hasInvestmentAccounts([])).toBe(false);
  });

  it('returns false for a credit-only item (e.g. AmEx)', () => {
    expect(hasInvestmentAccounts([{ type: 'credit' }])).toBe(false);
  });

  it('returns false for a depository-only item (e.g. Wells Fargo checking + savings)', () => {
    expect(
      hasInvestmentAccounts([{ type: 'depository' }, { type: 'depository' }]),
    ).toBe(false);
  });

  it('returns false for mixed depository + credit (no brokerage)', () => {
    expect(
      hasInvestmentAccounts([
        { type: 'depository' },
        { type: 'depository' },
        { type: 'credit' },
      ]),
    ).toBe(false);
  });

  it('returns true when at least one account is type=investment', () => {
    expect(
      hasInvestmentAccounts([
        { type: 'depository' },
        { type: 'investment' },
      ]),
    ).toBe(true);
  });

  it('returns true for an investment-only item (e.g. brokerage)', () => {
    expect(hasInvestmentAccounts([{ type: 'investment' }])).toBe(true);
  });

  it('ignores unknown types — returns false unless investment is present', () => {
    expect(
      hasInvestmentAccounts([{ type: 'loan' }, { type: 'other' }]),
    ).toBe(false);
  });
});
