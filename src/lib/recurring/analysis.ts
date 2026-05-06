import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';

const HIKE_RATIO_THRESHOLD = 0.15;
const HIKE_FLOOR_PER_MONTH = 2;

/**
 * Signed drift: (lastAmount - averageAmount) / averageAmount. Returns
 * null when undetectable (inflow direction, inactive, missing fields,
 * zero average). Negative values are smaller-than-usual; callers
 * decide what to do with them.
 */
export function hikeRatio(s: RecurringStreamRow): number | null {
  if (s.direction !== 'outflow') return null;
  if (!s.isActive) return null;
  if (s.averageAmount == null || s.lastAmount == null) return null;
  if (s.averageAmount === 0) return null;
  return (s.lastAmount - s.averageAmount) / s.averageAmount;
}

/**
 * Hike alert iff ratio > 15% AND the monthly-equivalent dollar delta
 * meets or exceeds $2/mo. The floor prevents tiny absolute charges
 * (e.g. $0.10 → $0.50) from surfacing as 400% hikes.
 */
export function isHikeAlert(s: RecurringStreamRow): boolean {
  const ratio = hikeRatio(s);
  if (ratio == null) return false;
  if (ratio <= HIKE_RATIO_THRESHOLD) return false;
  if (s.lastAmount == null || s.averageAmount == null) return false;
  const deltaMonthly =
    (s.lastAmount - s.averageAmount) *
    frequencyToMonthlyMultiplier(s.frequency);
  return deltaMonthly >= HIKE_FLOOR_PER_MONTH;
}

/** Stream's monthly-equivalent cost. Sign-agnostic. */
export function monthlyCost(s: RecurringStreamRow): number {
  if (s.averageAmount == null) return 0;
  return Math.abs(s.averageAmount) * frequencyToMonthlyMultiplier(s.frequency);
}

export type CategoryGroup = {
  category: string | null;
  humanLabel: string;
  total: number;
  streams: RecurringStreamRow[];
};

/**
 * Active outflows only, bucketed by primaryCategory. Inflows and
 * cancelled streams are handled in their own page sections — callers
 * pass the full stream list and this function filters.
 *
 * Within a bucket: streams sorted by monthlyCost desc.
 * Across buckets: total monthlyCost desc, except null ("Other") is
 * pinned to the bottom regardless of total.
 */
export function groupByCategory(
  streams: RecurringStreamRow[],
): CategoryGroup[] {
  const active = streams.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const buckets = new Map<string | null, RecurringStreamRow[]>();
  for (const s of active) {
    const key = s.primaryCategory ?? null;
    const arr = buckets.get(key);
    if (arr) arr.push(s);
    else buckets.set(key, [s]);
  }
  const groups: CategoryGroup[] = [];
  for (const [key, list] of buckets.entries()) {
    list.sort((a, b) => monthlyCost(b) - monthlyCost(a));
    const total = list.reduce((sum, s) => sum + monthlyCost(s), 0);
    groups.push({
      category: key,
      humanLabel: key ? humanizeCategory(key) : 'Other',
      total,
      streams: list,
    });
  }
  groups.sort((a, b) => {
    if (a.category === null && b.category !== null) return 1;
    if (b.category === null && a.category !== null) return -1;
    return b.total - a.total;
  });
  return groups;
}
