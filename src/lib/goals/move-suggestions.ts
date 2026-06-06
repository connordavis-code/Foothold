import { type DriftAnalysis } from '@/lib/db/queries/drift';
import { type RecurringStreamRow } from '@/lib/db/queries/recurring';
import { type GoalWithProgress } from '@/lib/db/queries/goals';
import { type GoalMove } from '@/lib/db/schema';
import { isHikeAlert, monthlyCost } from '@/lib/recurring/analysis';
import { humanizeCategory } from '@/lib/format/category';
import { formatCurrencyCompact } from '@/lib/utils';

/**
 * A pre-validation hint for the /goals UI. `params` is intentionally
 * partial — the producer here omits user-facing fields like `startMonth`
 * (and `endMonth`) that the UI's <MoveForm> must collect before submit.
 * Passing `suggestion.params` directly to `attachGoalMoveAction` will
 * Zod-fail; the UI layer is responsible for augmenting the partial.
 */
export type MoveSuggestion = {
  templateKey: 'reduce-category' | 'adjust-recurring';
  params: Record<string, unknown>;
  displayCopy: string;
  source: 'drift' | 'hike';
};

const MAX_SUGGESTIONS = 3;

// Stream hike magnitude — used for sort ordering. Named so the comparator
// expression below reads as "delta(b) − delta(a) descending."
const hikeDelta = (s: RecurringStreamRow): number =>
  (s.lastAmount ?? 0) - (s.averageAmount ?? 0);

/**
 * Produce up to 3 drift-based suggestions for the goal.
 *
 * Drift is a whole-financial-picture signal — any elevated category
 * is worth surfacing regardless of whether it matches the goal's own
 * categoryFilter, because cutting drift frees up cash for any savings
 * goal. (For spend-cap goals the goal's own category will naturally
 * appear in the elevated list when relevant, so no extra scoping is
 * needed.)
 *
 * Suppression: categories already covered by an attached reduce-category
 * move are dropped from the pool (SPEC edge case #7).
 *
 * Cap applied AFTER suppression so the 4th-by-ratio doesn't bubble up
 * if the 1st is suppressed.
 */
export function suggestFromDrift(
  driftAnalysis: DriftAnalysis,
  _goal: GoalWithProgress,
  attachedMoves: GoalMove[],
): MoveSuggestion[] {
  // Build a set of categories already covered by attached reduce-category moves.
  const coveredCategories = new Set<string>();
  for (const move of attachedMoves) {
    if (move.templateKey !== 'reduce-category') continue;
    // params is jsonb → unknown at the type level; runtime-narrow safely.
    if (
      move.params != null &&
      typeof move.params === 'object' &&
      'categoryKey' in move.params &&
      typeof (move.params as Record<string, unknown>).categoryKey === 'string'
    ) {
      coveredCategories.add(
        (move.params as Record<string, unknown>).categoryKey as string,
      );
    }
  }

  // currentlyElevated is already sorted ratio desc by the drift query.
  const pool = driftAnalysis.currentlyElevated.filter(
    (flag) => !coveredCategories.has(flag.category),
  );

  return pool.slice(0, MAX_SUGGESTIONS).map((flag) => {
    const delta = flag.currentTotal - flag.baselineWeekly;
    const displayName = humanizeCategory(flag.category);
    // baselineWeekly is the weekly median; scale to a recognizable weekly
    // delta. The amount shown is the overage vs the 3-month weekly avg.
    const displayCopy = `${displayName} drifted +${formatCurrencyCompact(Math.max(0, delta))} vs. 3-mo avg`;

    return {
      templateKey: 'reduce-category' as const,
      params: {
        // categoryKey carries the raw PFC string; validation.ts (T3) is
        // the strict gate for param shape on commit.
        categoryKey: flag.category,
        // startMonth omitted — T10 MoveForm requires user confirmation
        // for the window. Defaults to current month.
        // deltaAmount is the overage, converted from weekly to monthly.
        // (currentTotal - baselineWeekly) × (52/12) gives monthly delta.
        // Clamped to zero for edge cases where drift somehow surfaces
        // a non-positive overage.
        deltaAmount: Math.max(0, (flag.currentTotal - flag.baselineWeekly) * (52 / 12)),
      },
      displayCopy,
      source: 'drift' as const,
    };
  });
}

/**
 * Produce up to 3 hike-based suggestions.
 *
 * Suppression: streams already covered by an attached adjust-recurring
 * move (matching params.streamId) are dropped from the pool (SPEC edge
 * case #6).
 *
 * Cap applied AFTER suppression.
 * Ordering: hike delta descending (largest absolute hike first).
 */
export function suggestFromHikes(
  recurringStreams: RecurringStreamRow[],
  _goal: GoalWithProgress,
  attachedMoves: GoalMove[],
): MoveSuggestion[] {
  // Build a set of streamIds already covered by attached adjust-recurring moves.
  const coveredStreamIds = new Set<string>();
  for (const move of attachedMoves) {
    if (move.templateKey !== 'adjust-recurring') continue;
    if (
      move.params != null &&
      typeof move.params === 'object' &&
      'streamId' in move.params &&
      typeof (move.params as Record<string, unknown>).streamId === 'string'
    ) {
      coveredStreamIds.add(
        (move.params as Record<string, unknown>).streamId as string,
      );
    }
  }

  const hikers = recurringStreams
    .filter((s) => isHikeAlert(s) && !coveredStreamIds.has(s.id))
    // Sort by absolute dollar delta descending — biggest hike first.
    .sort((a, b) => hikeDelta(b) - hikeDelta(a));

  return hikers.slice(0, MAX_SUGGESTIONS).map((stream) => {
    const name = stream.merchantName ?? stream.description ?? 'Recurring charge';
    const avg = stream.averageAmount ?? 0;
    const last = stream.lastAmount ?? 0;
    const displayCopy = `${name} hiked from ${formatCurrencyCompact(avg)} to ${formatCurrencyCompact(last)}`;

    return {
      templateKey: 'adjust-recurring' as const,
      params: {
        streamId: stream.id,
        // newAmount defaults to the pre-hike average converted to monthly equivalent.
        // monthlyCost takes the stream and applies its frequency multiplier.
        // "set back to normal" in monthly terms.
        newAmount: monthlyCost(stream),
      },
      displayCopy,
      source: 'hike' as const,
    };
  });
}
