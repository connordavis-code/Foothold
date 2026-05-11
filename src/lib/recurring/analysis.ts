import {
  frequencyToMonthlyMultiplier,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';

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
