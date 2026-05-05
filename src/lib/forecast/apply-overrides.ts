import type { MonthlyProjection, ScenarioOverrides } from './types';

/**
 * Apply category deltas. Positive delta = increase that category's outflow
 * for affected months; negative = cut. Floor at 0 (a category can't have
 * negative outflow even if the user enters a delta larger than baseline).
 *
 * Recomputes endCash chain as the function progresses.
 */
export function applyCategoryDeltas(
  projection: MonthlyProjection[],
  deltas: ScenarioOverrides['categoryDeltas'],
): MonthlyProjection[] {
  if (!deltas || deltas.length === 0) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash =
    projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let outflowDelta = 0;
    const newByCategory = { ...month.byCategory };

    for (const d of deltas) {
      if (d.startMonth && month.month < d.startMonth) continue;
      if (d.endMonth && month.month > d.endMonth) continue;

      const current = newByCategory[d.categoryId] ?? 0;
      const adjusted = Math.max(0, current + d.monthlyDelta);
      const actualDelta = adjusted - current;
      newByCategory[d.categoryId] = adjusted;
      outflowDelta += actualDelta;
    }

    const newOutflows = month.outflows + outflowDelta;
    const startCash = runningCash;
    const endCash = startCash + month.inflows - newOutflows;
    result.push({
      ...month,
      startCash,
      outflows: newOutflows,
      endCash,
      byCategory: newByCategory,
    });
    runningCash = endCash;
  }

  return result;
}
