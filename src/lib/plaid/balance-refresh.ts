/**
 * Plaid `accounts/balance/get` refreshes intraday balances. Investment
 * balances flow through holdings sync, not this endpoint. Loan/other
 * subtypes don't return useful current/available balances either, and
 * passing them in `account_ids` invites 4xx responses that take down
 * legitimate refreshes for the rest of the item.
 *
 * Filtering to depository+credit before the call is defensively correct
 * independent of any specific upstream error code. The bare endpoint
 * returns all accounts and the prior UPDATE wrote `currentBalance: null`
 * back over real values when Plaid omitted a balance — the filter
 * eliminates that whole class of corruption too.
 */

const BALANCE_REFRESHABLE_TYPES = new Set(['depository', 'credit']);

export function selectRefreshableAccounts<T extends { type: string }>(
  accounts: T[],
): T[] {
  return accounts.filter((a) => BALANCE_REFRESHABLE_TYPES.has(a.type));
}

/**
 * Plaid's accounts/balance/get returns rows where `balances.current` or
 * `balances.available` can independently be null. Per Plaid SDK contract
 * at least one is non-null on a successful call (credit cards routinely
 * return available=null; depository can return current=null mid-fetch).
 *
 * The naive UPDATE used to write `null` straight back over real values,
 * which is silently worse than a 4xx — every read surface treats null
 * as zero (dashboard, forecast, savings goals) so a "successful refresh"
 * could understate cash on the headline. Build the SET object so each
 * field is only included when Plaid returned a real value; the missing
 * field stays at its prior value in the database.
 */
type PlaidAccountBalances = {
  current?: number | null;
  available?: number | null;
};

export type BalanceUpdate = {
  currentBalance?: string;
  availableBalance?: string;
};

export function buildBalanceUpdate(
  balances: PlaidAccountBalances,
): BalanceUpdate {
  const update: BalanceUpdate = {};
  if (balances.current != null) {
    update.currentBalance = String(balances.current);
  }
  if (balances.available != null) {
    update.availableBalance = String(balances.available);
  }
  return update;
}
