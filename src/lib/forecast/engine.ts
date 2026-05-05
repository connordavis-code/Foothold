import {
  applyCategoryDeltas,
  applyIncomeDelta,
  applyLumpSums,
  applyRecurringChanges,
  applySkipRecurringInstances,
} from './apply-overrides';
import { computeBaseline } from './baseline';
import { computeGoalImpacts } from './goal-projection';
import type { ProjectCashInput, ProjectionResult } from './types';

const DEFAULT_HORIZON = 12;

/**
 * Engine entry point. Pure function:
 *   1. Compute baseline projection
 *   2. Apply overrides in a deterministic order
 *   3. Compute goal impacts (baseline vs scenario projection)
 *
 * Override application order (see spec §5.2) matters for mental modeling
 * but does NOT cause mathematical conflicts — each step targets a
 * different part of the model.
 */
export function projectCash(input: ProjectCashInput): ProjectionResult {
  const { history, overrides, currentMonth } = input;
  const horizon = overrides.horizonMonths ?? DEFAULT_HORIZON;

  // Step 1: baseline (no overrides)
  const baseline = computeBaseline(history, currentMonth, horizon);

  // Steps 2-6: apply overrides in deterministic order
  let scenario = baseline;
  scenario = applyCategoryDeltas(scenario, overrides.categoryDeltas);
  scenario = applyIncomeDelta(scenario, overrides.incomeDelta);
  scenario = applyRecurringChanges(scenario, history.recurringStreams, overrides.recurringChanges);
  scenario = applySkipRecurringInstances(scenario, history.recurringStreams, overrides.skipRecurringInstances);
  scenario = applyLumpSums(scenario, overrides.lumpSums);

  // Step 7: goal impacts
  const goalImpacts = computeGoalImpacts(baseline, scenario, history.goals, overrides);

  return { projection: scenario, goalImpacts };
}
