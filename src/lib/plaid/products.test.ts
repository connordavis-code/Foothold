import { describe, expect, it } from 'vitest';
import { linkConsentedProducts } from './products';

// Regression: 2026-05-11 production incident — adding 'balance' to
// PLAID_PRODUCTS env caused createLinkToken + createLinkTokenForUpdate
// to 400 every time because Plaid's linkTokenCreate rejects 'balance'
// as a value for additional_consented_products. The 'balance' product
// is enabled at the Plaid app level and called directly via
// accountsBalanceGet — it does NOT need per-item Link consent.
//
// Lock the filter behavior here so a future refactor can't accidentally
// re-poison the Link request.
describe('linkConsentedProducts', () => {
  it('returns empty array when env list is empty', () => {
    expect(linkConsentedProducts([])).toEqual([]);
  });

  it('drops the always-required `transactions` (it goes in `products`, not optionals)', () => {
    expect(linkConsentedProducts(['transactions'])).toEqual([]);
  });

  it('keeps `investments` (valid for additional_consented_products)', () => {
    expect(linkConsentedProducts(['transactions', 'investments'])).toEqual([
      'investments',
    ]);
  });

  it('drops `balance` even when present in env (Plaid rejects it as a Link product)', () => {
    expect(linkConsentedProducts(['transactions', 'balance'])).toEqual([]);
  });

  it('drops `balance` from a mixed env list, keeps the rest', () => {
    expect(
      linkConsentedProducts(['transactions', 'investments', 'balance']),
    ).toEqual(['investments']);
  });

  it('preserves order of the surviving products', () => {
    expect(
      linkConsentedProducts(['transactions', 'liabilities', 'investments']),
    ).toEqual(['liabilities', 'investments']);
  });

  it('handles env list without transactions (defensive — env should always include it)', () => {
    expect(linkConsentedProducts(['investments', 'balance'])).toEqual([
      'investments',
    ]);
  });
});
