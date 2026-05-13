import { describe, expect, it } from 'vitest';
import { INTERNAL_TRANSFER_CATEGORIES } from './exclusions';

describe('INTERNAL_TRANSFER_CATEGORIES', () => {
  it('excludes both Plaid transfer PFCs', () => {
    expect(INTERNAL_TRANSFER_CATEGORIES).toContain('TRANSFER_IN');
    expect(INTERNAL_TRANSFER_CATEGORIES).toContain('TRANSFER_OUT');
  });

  // Loan payments ARE real cash outflows (cash leaves the account, even
  // though net worth is unchanged because liability drops the same amount).
  // Phase 2 will model liability paydown separately for the net-worth view;
  // until then, loans must stay in the cash projection.
  it('does NOT include LOAN_PAYMENTS — loans are real cash flow', () => {
    expect(INTERNAL_TRANSFER_CATEGORIES).not.toContain('LOAN_PAYMENTS');
  });
});
