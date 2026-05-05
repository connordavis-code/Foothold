import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from './types';

type EffectiveGoal = {
  id: string;
  name: string;
  targetAmount: number;
  monthlyContribution: number;
  startingSaved: number;
};

/**
 * Compute baseline + scenario ETAs for each goal (real + hypothetical).
 *
 * "ETA" = first month in the projection where cumulative contribution
 * (startingSaved + monthlyContribution × months) ≥ targetAmount.
 * Null if not reached within the projection's horizon.
 *
 * Real goals get both baseline ETA (using current values) and scenario ETA
 * (using goalTargetEdits if any). Hypothetical goals get scenario ETA only;
 * baseline ETA is null because they don't exist in baseline.
 */
export function computeGoalImpacts(
  baselineProjection: MonthlyProjection[],
  scenarioProjection: MonthlyProjection[],
  realGoals: ForecastHistory['goals'],
  overrides: ScenarioOverrides,
): GoalImpact[] {
  const result: GoalImpact[] = [];

  // Build effective goal lists for baseline (no overrides) and scenario.
  const baselineGoals: EffectiveGoal[] = realGoals.map((g) => ({
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    monthlyContribution: g.monthlyContribution ?? 0,
    startingSaved: g.currentSaved,
  }));

  const editsById = new Map(
    (overrides.goalTargetEdits ?? []).map((e) => [e.goalId, e]),
  );
  const scenarioGoals: EffectiveGoal[] = realGoals.map((g) => {
    const edit = editsById.get(g.id);
    return {
      id: g.id,
      name: g.name,
      targetAmount: edit?.newTargetAmount ?? g.targetAmount,
      monthlyContribution: edit?.newMonthlyContribution ?? g.monthlyContribution ?? 0,
      startingSaved: g.currentSaved,
    };
  });

  for (const hypo of overrides.hypotheticalGoals ?? []) {
    scenarioGoals.push({
      id: `hypo:${hypo.id}`,
      name: hypo.name,
      targetAmount: hypo.targetAmount,
      monthlyContribution: hypo.monthlyContribution ?? 0,
      startingSaved: 0,
    });
  }

  // For real goals, compute both ETAs and emit shift.
  for (const real of realGoals) {
    const baseGoal = baselineGoals.find((g) => g.id === real.id);
    const scnGoal = scenarioGoals.find((g) => g.id === real.id);
    const baselineETA = baseGoal ? findGoalETA(baseGoal, baselineProjection) : null;
    const scenarioETA = scnGoal ? findGoalETA(scnGoal, scenarioProjection) : null;
    result.push({
      goalId: real.id,
      name: real.name,
      baselineETA,
      scenarioETA,
      shiftMonths: monthsBetween(baselineETA, scenarioETA),
    });
  }

  // Hypothetical goals: baseline ETA is always null (don't exist there).
  for (const hypo of overrides.hypotheticalGoals ?? []) {
    const goal = scenarioGoals.find((g) => g.id === `hypo:${hypo.id}`);
    if (!goal) continue;
    const scenarioETA = findGoalETA(goal, scenarioProjection);
    result.push({
      goalId: `hypo:${hypo.id}`,
      name: hypo.name,
      baselineETA: null,
      scenarioETA,
      shiftMonths: 0,
    });
  }

  return result;
}

function findGoalETA(
  goal: EffectiveGoal,
  projection: MonthlyProjection[],
): string | null {
  let cumulative = goal.startingSaved;
  for (const month of projection) {
    cumulative += goal.monthlyContribution;
    if (cumulative >= goal.targetAmount) return month.month;
  }
  return null;
}

function monthsBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}
