/**
 * Pure capability predicates for Plaid items. Used by syncItem to gate
 * paid product calls (investmentsHoldingsGet, investmentsTransactionsGet)
 * against the item's actual account types — credit-only and depository-
 * only items skip the investments calls entirely, both for cost control
 * and to avoid PRODUCTS_NOT_SUPPORTED errors from those institutions.
 *
 * Sibling to balance-refresh.ts's `selectRefreshableAccounts` (which
 * filters to depository+credit for `accountsBalanceGet`).
 */

export function hasInvestmentAccounts(
  accs: ReadonlyArray<{ type: string }>,
): boolean {
  return accs.some((a) => a.type === 'investment');
}
