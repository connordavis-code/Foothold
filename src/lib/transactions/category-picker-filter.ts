import type { CategoryOption } from '@/lib/db/queries/categories';

/**
 * Names of PFC-seeded categories that are surfaced in the category
 * picker but represent a *classification* claim ("this is a transfer")
 * rather than a *display* claim ("file this under category X"). Picking
 * one of these from the picker writes to `category_override_id`, which
 * the forecast filter NEVER reads — silently no-op'ing the user's
 * apparent transfer-marking intent.
 *
 * The dedicated affordance for transfer classification (the "Mark as
 * transfer" / "Mark as not a transfer" buttons in TransactionDetailSheet)
 * writes to `is_transfer_override`, which the forecast filter DOES
 * read. Keeping these PFC entries out of the write-picker eliminates
 * the wrong-column foot-gun.
 *
 * Comparison is case-insensitive on the normalized PFC string the
 * humanizer produces (`Transfer Out` / `Transfer In`).
 */
const TRANSFER_CLASSIFICATION_PFCS = new Set([
  'transfer out',
  'transfer in',
]);

/**
 * Filter applied at every write boundary that consumes
 * `CategoryOption[]`. Drops the two PFC entries that look like
 * transfer-marking affordances but write to the wrong column.
 *
 * Read-side filters (e.g., the URL `?category=Transfer Out` filter on
 * /transactions) are UNAFFECTED — they read from `primaryCategory`,
 * not from this picker.
 */
export function filterCategoryPickerOptions(
  options: readonly CategoryOption[],
): CategoryOption[] {
  return options.filter((o) => {
    if (o.source !== 'pfc') return true;
    return !TRANSFER_CLASSIFICATION_PFCS.has(o.name.trim().toLowerCase());
  });
}
