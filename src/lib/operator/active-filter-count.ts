/**
 * Count active filter params for the mobile FilterSheet trigger badge.
 * Pure predicate — accepts a plain object so callers can pass URL
 * search params or a hand-built record.
 *
 * Keys treated as filters on /transactions: account, category, from, to, q.
 */
const TRANSACTION_FILTER_KEYS = [
  'account',
  'category',
  'from',
  'to',
  'q',
] as const;

export function activeTransactionFilterCount(
  params: Record<string, string | undefined | null>,
): number {
  let n = 0;
  for (const key of TRANSACTION_FILTER_KEYS) {
    const v = params[key];
    if (v && v.length > 0) n += 1;
  }
  return n;
}
