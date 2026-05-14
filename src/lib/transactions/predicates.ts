import { INTERNAL_TRANSFER_CATEGORIES } from '@/lib/forecast/exclusions';

/**
 * Decide whether a transaction should be treated as an internal transfer
 * between the user's own accounts (and therefore excluded from cash-flow
 * projections, spend totals, and income totals).
 *
 * Tri-state precedence: a non-null `isTransferOverride` wins outright;
 * otherwise fall back to the Plaid PFC. Mirrors the COALESCE-style
 * predicate used in the forecast query so JS-side and SQL-side stay in
 * lockstep.
 */
export function shouldTreatAsTransfer(input: {
  primaryCategory: string | null;
  isTransferOverride: boolean | null;
}): boolean {
  if (input.isTransferOverride !== null) return input.isTransferOverride;
  if (input.primaryCategory === null) return false;
  return (INTERNAL_TRANSFER_CATEGORIES as readonly string[]).includes(
    input.primaryCategory,
  );
}
