import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeCategory } from '@/lib/format/category';
import type { CoachingInput } from './coaching';
import type { PaceVerdict } from './pace';

export type TopDiscretionaryCategory = { name: string; monthlyAmount: number };

/**
 * Builds the discriminated-union input that composeCoaching expects, from
 * a goal + its computed paceVerdict + the page-level top-discretionary
 * category (only consumed by the savings-behind branch).
 *
 * Relocated from src/app/(app)/goals/[id]/page.tsx during R.3.1's IA
 * shift — extracted into its own module so the new /goals card list can
 * reuse the same input-shaping logic without dragging in the detail
 * page's feed-fetching machinery. The `feed` parameter from the
 * detail-page version is dropped; spend_cap topMerchants always pass as
 * `[]` (the goal card doesn't render merchant breakdowns).
 *
 * Returns CoachingInput (non-null) — every PaceVerdict × goal type
 * combination has a defined branch.
 */
export function buildCoachingInput(
  goal: GoalWithProgress,
  verdict: PaceVerdict,
  topCategory: TopDiscretionaryCategory | null,
): CoachingInput {
  const p = goal.progress;
  if (p.type === 'savings') {
    if (verdict === 'hit') {
      return {
        kind: 'savings',
        verdict: 'hit',
        hitDate: new Date().toISOString().slice(0, 10),
        overshoot: p.current - p.target,
      };
    }
    const required = computeRequiredMonthlyVelocity(goal);
    if (verdict === 'on-pace') {
      return {
        kind: 'savings',
        verdict: 'on-pace',
        monthlyVelocity: p.monthlyVelocity,
        requiredMonthlyVelocity: required,
        topDiscretionaryCategory: null,
      };
    }
    // 'behind' (and defensively 'over', which shouldn't occur on savings —
    // paceVerdict reserves 'over' for spend_cap)
    return {
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: p.monthlyVelocity,
      requiredMonthlyVelocity: required,
      topDiscretionaryCategory: topCategory
        ? {
            name: humanizeCategory(topCategory.name),
            monthlyAmount: topCategory.monthlyAmount,
          }
        : null,
    };
  }

  // spend_cap: topMerchants always empty (we don't fetch the contributing feed)
  if (verdict === 'over') {
    return {
      kind: 'spend_cap',
      verdict: 'over',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants: [],
    };
  }
  if (verdict === 'behind') {
    return {
      kind: 'spend_cap',
      verdict: 'behind',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants: [],
    };
  }
  return {
    kind: 'spend_cap',
    verdict: 'on-pace',
    cap: p.cap,
    spent: p.spent,
    projectedMonthly: p.projectedMonthly,
    topMerchants: [],
  };
}

/**
 * Required monthly contribution to hit the savings target by its
 * targetDate. Falls back to remaining/12 when no targetDate is set.
 * Floors monthsRemaining at 1 so a past target doesn't divide by zero
 * (or produce negative required velocity).
 *
 * Returns 0 for spend_cap goals — the concept doesn't apply.
 */
export function computeRequiredMonthlyVelocity(goal: GoalWithProgress): number {
  if (goal.progress.type !== 'savings') return 0;
  const remaining = goal.progress.remaining;
  if (!goal.targetDate) return remaining / 12;
  const target = new Date(goal.targetDate + 'T00:00:00Z');
  const today = new Date();
  const monthsRemaining = Math.max(
    1,
    (target.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  return remaining / monthsRemaining;
}
