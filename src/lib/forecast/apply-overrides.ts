import type { ForecastHistory, MonthlyProjection, ScenarioOverrides } from './types';

const monthlyEquivalent = (
  amount: number,
  cadence: 'weekly' | 'biweekly' | 'monthly',
): number => {
  if (cadence === 'weekly') return amount * 4.333;
  if (cadence === 'biweekly') return amount * 2.167;
  return amount;
};

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

/**
 * Apply income delta to inflows for affected months. Positive = income up,
 * negative = income down. Floor at 0 (income can't be negative).
 *
 * Recomputes endCash chain forward.
 */
export function applyIncomeDelta(
  projection: MonthlyProjection[],
  delta: ScenarioOverrides['incomeDelta'],
): MonthlyProjection[] {
  if (!delta) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    const inRange =
      (!delta.startMonth || month.month >= delta.startMonth) &&
      (!delta.endMonth || month.month <= delta.endMonth);
    const newInflows = inRange
      ? Math.max(0, month.inflows + delta.monthlyDelta)
      : month.inflows;
    const startCash = runningCash;
    const endCash = startCash + newInflows - month.outflows;
    result.push({ ...month, startCash, inflows: newInflows, endCash });
    runningCash = endCash;
  }

  return result;
}

/**
 * Apply pause / edit / add changes to recurring streams.
 *
 * Strategy: for each month, compute the (positive or negative) delta to
 * inflows and outflows that the changes produce, then apply.
 *   - pause: subtract the stream's monthly equivalent from its direction
 *   - edit: subtract the original amount + add the new amount (both monthly equivalents)
 *   - add: add the new stream's monthly equivalent
 */
export function applyRecurringChanges(
  projection: MonthlyProjection[],
  baseStreams: ForecastHistory['recurringStreams'],
  changes: ScenarioOverrides['recurringChanges'],
): MonthlyProjection[] {
  if (!changes || changes.length === 0) return projection;

  const baseById = new Map(baseStreams.map((s) => [s.id, s]));
  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const change of changes) {
      const inRange =
        (!change.startMonth || month.month >= change.startMonth) &&
        (!change.endMonth || month.month <= change.endMonth);
      if (!inRange) continue;

      if (change.action === 'pause') {
        const original = baseById.get(change.streamId ?? '');
        if (!original) continue;
        const orig = monthlyEquivalent(original.amount, original.cadence);
        if (original.direction === 'outflow') outflowDelta -= orig;
        else inflowDelta -= orig;
      } else if (change.action === 'edit') {
        const original = baseById.get(change.streamId ?? '');
        if (!original) continue;
        const orig = monthlyEquivalent(original.amount, original.cadence);
        const newAmount = change.amount ?? original.amount;
        const newCadence = change.cadence ?? original.cadence;
        const newDirection = change.direction ?? original.direction;
        const next = monthlyEquivalent(newAmount, newCadence);
        // Remove original
        if (original.direction === 'outflow') outflowDelta -= orig;
        else inflowDelta -= orig;
        // Add new
        if (newDirection === 'outflow') outflowDelta += next;
        else inflowDelta += next;
      } else if (change.action === 'add') {
        const next = monthlyEquivalent(
          change.amount ?? 0,
          change.cadence ?? 'monthly',
        );
        if (change.direction === 'outflow') outflowDelta += next;
        else inflowDelta += next;
      }
    }

    const newInflows = Math.max(0, month.inflows + inflowDelta);
    const newOutflows = Math.max(0, month.outflows + outflowDelta);
    const startCash = runningCash;
    const endCash = startCash + newInflows - newOutflows;
    result.push({
      ...month,
      startCash,
      inflows: newInflows,
      outflows: newOutflows,
      endCash,
    });
    runningCash = endCash;
  }

  return result;
}
