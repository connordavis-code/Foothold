/**
 * Plaid PFC categories representing money moving between the user's own
 * accounts. These are filtered out of the cash-flow projection because
 * they're not real outflows (or inflows) — only an asset reallocation.
 *
 * Distinct from insights/drift's NON_SPEND_CATEGORIES (which also
 * excludes LOAN_PAYMENTS). Loan payments ARE real cash outflows for the
 * projection lens; they'll be modelled separately as liability paydown
 * when Phase 2 introduces the net-worth time series.
 */
export const INTERNAL_TRANSFER_CATEGORIES = [
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
