import type { CategoryOption } from '@/lib/db/queries/categories';

/**
 * Category names that represent a *classification* claim ("this is a
 * transfer") rather than a *display* claim ("file this under category
 * X"). Picking one of these from the write picker writes to
 * `category_override_id` (via `updateTransactionCategoriesAction`),
 * which the forecast filter NEVER reads — silently no-op'ing the
 * user's apparent transfer-marking intent.
 *
 * The dedicated affordance for transfer classification (the "Mark as
 * transfer" / "Mark as not a transfer" buttons in
 * `TransactionDetailSheet`) writes to `is_transfer_override`, which
 * the forecast filter DOES read. The dedicated affordance is the
 * single source of truth for the transfer-classification semantic;
 * any picker option with these names is therefore a look-alike-path
 * foot-gun regardless of how it got into the user's category table.
 *
 * Comparison is case-insensitive and whitespace-trimmed.
 */
const TRANSFER_CLASSIFICATION_NAMES = new Set([
  'transfer out',
  'transfer in',
]);

/**
 * Filter applied at every write boundary that consumes
 * `CategoryOption[]`. Drops any entry — PFC-seeded OR user-created
 * — whose normalized name matches a transfer-classification label.
 *
 * Source-agnostic by design: an earlier (pre-fix) buggy click that
 * routed through `findOrCreateCategoryByName('Transfer Out', userId)`
 * creates a `source: 'user'` row with that name, which the prior
 * `source === 'pfc'` gate let pass through — re-creating the
 * look-alike foot-gun. Even absent that bug-artifact path, a user
 * who manually creates a "Transfer Out" category for display
 * purposes still confuses the write semantic; the dedicated transfer
 * affordance is the unambiguous path either way.
 *
 * Read-side filters (the URL `?category=Transfer Out` filter on
 * /transactions) are UNAFFECTED — they read from `primaryCategory`,
 * not from this picker.
 */
export function filterCategoryPickerOptions(
  options: readonly CategoryOption[],
): CategoryOption[] {
  return options.filter((o) => {
    return !TRANSFER_CLASSIFICATION_NAMES.has(o.name.trim().toLowerCase());
  });
}
