import type { Products } from 'plaid';

/**
 * Plaid products that are NOT valid values for
 * `additional_consented_products` on linkTokenCreate. These products
 * are enabled at the Plaid app level (Dashboard + PLAID_PRODUCTS env)
 * and called directly via their respective endpoints — they don't
 * participate in per-item Link consent.
 *
 * `balance` is the canonical example: enable it in Plaid Dashboard,
 * add it to PLAID_PRODUCTS env so the cron uses accountsBalanceGet,
 * but DON'T pass it to Link — Plaid 400s the linkTokenCreate request
 * if you do.
 *
 * Empirically discovered 2026-05-11 when adding `balance` to
 * PLAID_PRODUCTS poisoned createLinkToken + createLinkTokenForUpdate
 * with HTTP 400 every call.
 */
const NON_LINK_CONSENTABLE: ReadonlySet<string> = new Set(['balance']);

/**
 * Derive the list for Link's `additional_consented_products` from the
 * env-supplied PLAID_PRODUCTS list. Excludes:
 *
 *  - `transactions` — always required, goes in `products` not optionals
 *  - any product Plaid's link API rejects (NON_LINK_CONSENTABLE)
 *
 * Order is preserved so caller can rely on a deterministic result.
 */
export function linkConsentedProducts(
  envProducts: ReadonlyArray<string>,
): Products[] {
  return envProducts.filter(
    (p) => p !== 'transactions' && !NON_LINK_CONSENTABLE.has(p),
  ) as Products[];
}
