import { categoryToTokens } from '@/lib/transactions/category-palette';
import { humanizeCategory } from '@/lib/format/category';
import { cn } from '@/lib/utils';

type Props = {
  /** Raw Plaid PFC string (e.g. "FOOD_AND_DRINK"). Null when unknown. */
  primaryCategory: string | null;
  /** User-override category name when set. */
  overrideCategoryName: string | null;
  /** Optional size variant; defaults to compact table pill. */
  size?: 'sm' | 'xs';
};

/**
 * Restrained category pill. The visible label prefers the user's
 * override; falls back to humanized PFC; ultimately em-dash.
 *
 * Token mapping is sourced from categoryToTokens, which keeps three
 * classes (income / caution / structural) by SPEC contract. The
 * override path runs the OVERRIDE NAME through categoryToTokens too —
 * a user labeling a row "Groceries" still surfaces caution semantics
 * because the lookup is case-insensitive.
 *
 * The override-styling cue (italic title hint) is owned by the
 * consuming row, not the chip — chips read the same regardless of
 * source so the scan pattern stays consistent.
 */
export function CategoryChip({
  primaryCategory,
  overrideCategoryName,
  size = 'sm',
}: Props) {
  // Choose the source for both label AND token routing. If a user
  // overrode the category, the chip describes the user's intent;
  // categoryToTokens runs against the override name so the palette
  // honors that intent (e.g. user-labeled "Groceries" → caution).
  const sourceForTokens = overrideCategoryName ?? primaryCategory;
  const { bg, fg } = categoryToTokens(sourceForTokens);

  const label = overrideCategoryName
    ? overrideCategoryName
    : primaryCategory
      ? humanizeCategory(primaryCategory)
      : '—';

  const sizeClass =
    size === 'xs'
      ? 'h-[18px] px-1.5 text-[10px]'
      : 'h-5 px-2 text-[11px]';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill font-medium tracking-tight whitespace-nowrap',
        sizeClass,
        bg,
        fg,
      )}
    >
      {label}
    </span>
  );
}
