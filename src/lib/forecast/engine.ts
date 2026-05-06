import {
  applyCategoryDeltas,
  applyIncomeDelta,
  applyLumpSums,
  applyRecurringChanges,
  applySkipRecurringInstances,
  clampForDisplay,
} from './apply-overrides';
import { computeBaseline } from './baseline';
import { computeGoalImpacts } from './goal-projection';
import type { ProjectCashInput, ProjectionResult } from './types';

const DEFAULT_HORIZON = 12;

/**
 * Engine entry point. Pure function:
 *   1. Compute baseline projection
 *   2. Apply overrides in a deterministic order — each applier accumulates
 *      SIGNED deltas into the projection (closes review W-09)
 *   3. Compute goal impacts (baseline vs scenario projection — uses
 *      unclamped cash so the W-01 cash gate sees true trajectory)
 *   4. clampForDisplay: clip inflows/outflows/byCategory at 0 for the
 *      display contract; startCash/endCash stay unclamped so the cash
 *      math remains consistent
 *
 * Order of override application matters for mental modeling but does
 * NOT cause mathematical conflicts — appliers compose by accumulating
 * signed deltas, and clampForDisplay is the only step that clips.
 * Commutativity holds for any ordering of non-overlapping override
 * types (see apply-overrides-commutativity.test.ts).
 *
 * @param input.currentMonth — Caller-supplied (YYYY-MM). The engine never
 *   reads system time; this preserves purity and determinism.
 * @returns ProjectionResult where `endCash` may be negative — callers
 *   MUST NOT sanitize. A scenario that projects you running out of cash
 *   is exactly what the simulator is supposed to surface.
 */
export function projectCash(input: ProjectCashInput): ProjectionResult {
  const { history, overrides, currentMonth } = input;
  const horizon = overrides.horizonMonths ?? DEFAULT_HORIZON;

  // Step 1: baseline (no overrides)
  const baseline = computeBaseline(history, currentMonth, horizon);

  // Steps 2-6: apply overrides in deterministic order (signed math)
  let scenario = baseline;
  scenario = applyCategoryDeltas(scenario, overrides.categoryDeltas);
  scenario = applyIncomeDelta(scenario, overrides.incomeDelta);
  scenario = applyRecurringChanges(scenario, history.recurringStreams, overrides.recurringChanges);
  scenario = applySkipRecurringInstances(scenario, history.recurringStreams, overrides.skipRecurringInstances);
  scenario = applyLumpSums(scenario, overrides.lumpSums);

  // Step 7: goal impacts BEFORE clamp — findGoalETA reads month.endCash for
  // the cash gate (W-01) and needs the true (unclamped) cash trajectory.
  const goalImpacts = computeGoalImpacts(baseline, scenario, history.goals, overrides);

  // Step 8: clamp display fields. startCash/endCash preserved.
  return { projection: clampForDisplay(scenario), goalImpacts };
}
