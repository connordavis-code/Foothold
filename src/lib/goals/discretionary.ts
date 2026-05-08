export type CategoryMonthRow = {
  /** PFC enum like 'FOOD_AND_DRINK', or null for uncategorized. */
  category: string | null;
  /** YYYY-MM bucket. */
  ym: string;
  /** Sum of positive (outflow) amounts in this category × month. */
  monthTotal: number;
};

export type DiscretionaryPick = {
  /** PFC enum (caller should humanize). */
  name: string;
  /** Median of the per-month totals across `monthBuckets`, with absent months
   *  treated as $0. */
  monthlyAmount: number;
};

/**
 * Selects the highest-median PFC category from a set of (category, month-total)
 * rows over a fixed list of month buckets.
 *
 * The bug this guards against: if you take the median of ONLY the months where
 * a category had spend, a one-off purchase looks like a steady monthly cost.
 * Zero-filling absent months gives a realistic baseline — a category that
 * appeared in 1 of 3 months ends up with median 0 (sorted [0, 0, 900] → 0),
 * losing to a category with consistent activity.
 *
 * Returns null when no category has any matching month-total in the window.
 */
export function pickTopDiscretionaryCategory(
  rows: ReadonlyArray<CategoryMonthRow>,
  monthBuckets: ReadonlyArray<string>,
): DiscretionaryPick | null {
  if (monthBuckets.length === 0) return null;
  const byCategory = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.category) continue;
    if (monthBuckets.indexOf(r.ym) === -1) continue;
    if (!byCategory.has(r.category)) {
      byCategory.set(r.category, new Array(monthBuckets.length).fill(0));
    }
    const idx = monthBuckets.indexOf(r.ym);
    byCategory.get(r.category)![idx] = r.monthTotal;
  }
  let best: DiscretionaryPick | null = null;
  for (const [name, totals] of byCategory) {
    const sorted = [...totals].sort((a, b) => a - b);
    const m = sorted.length;
    const median =
      m % 2 === 1
        ? sorted[(m - 1) / 2]
        : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
    if (!best || median > best.monthlyAmount) {
      best = { name, monthlyAmount: median };
    }
  }
  return best;
}
