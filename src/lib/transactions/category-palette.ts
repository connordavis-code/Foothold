export type CategoryTokens = {
  bg: string;
  fg: string;
};

const INCOME: CategoryTokens = {
  bg: 'bg-[--accent-strong]/10',
  fg: 'text-[--accent-strong]',
};
const CAUTION: CategoryTokens = {
  bg: 'bg-[--semantic-caution]/10',
  fg: 'text-[--semantic-caution]',
};
const STRUCTURAL: CategoryTokens = {
  bg: 'bg-[--hairline]',
  fg: 'text-[--text-2]',
};

/**
 * Plaid PFCs that resolve to the caution class. Note this is a small,
 * restrained set — adding new entries here is a design decision (the
 * "max 3-4 distinct hues visible at once" rule from SPEC § Locked
 * decisions #4 is what keeps this from drifting into Christmas-tree
 * territory). The full Plaid PFC list has ~100 entries; everything
 * else falls through to structural.
 */
const CAUTION_PFCS = new Set([
  'FOOD_AND_DRINK',
  'FOOD_AND_DRINK_RESTAURANTS',
  'FOOD_AND_DRINK_GROCERIES',
  'ENTERTAINMENT',
  'PERSONAL_CARE',
  'MEDICAL',
]);

/**
 * Map a category string (Plaid PFC or user-override name) to one of
 * three Foothold token classes. The fallthrough is intentional — when
 * in doubt, structural keeps the row visually quiet.
 *
 * Casing is normalized so user-override names like "Groceries" still
 * route via the structural class without surprises; Plaid PFCs always
 * arrive upper-snake. Income detection runs first (prefix match) since
 * it covers ~10 PFCs without enumerating each.
 */
export function categoryToTokens(category: string | null): CategoryTokens {
  if (!category) return STRUCTURAL;
  const upper = category.toUpperCase();
  if (upper === 'INCOME' || upper.startsWith('INCOME_')) return INCOME;
  if (CAUTION_PFCS.has(upper)) return CAUTION;
  return STRUCTURAL;
}
