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
 * for affected months; negative = cut.
 *
 * Signed math (closes review W-09): a delta whose magnitude exceeds the
 * category's baseline drives the value negative; clamping is deferred to
 * `clampForDisplay` at engine output. This preserves "over-cut slack" so
 * a later applier (e.g. lump-sum outflow) can absorb it instead of
 * silently rounding away information.
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
      newByCategory[d.categoryId] = current + d.monthlyDelta;
      outflowDelta += d.monthlyDelta;
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
 * negative = income down.
 *
 * Signed math (closes review W-09): no per-applier clamp; clampForDisplay
 * handles the "inflows can't be negative" display semantic at engine output.
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
      ? month.inflows + delta.monthlyDelta
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

    // Signed math (W-09): no per-applier clamp.
    const newInflows = month.inflows + inflowDelta;
    const newOutflows = month.outflows + outflowDelta;
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

/**
 * Skip a specific instance of a recurring stream in a target month.
 * Subtracts the stream's monthly equivalent from inflows or outflows for
 * that month only, then re-chains endCash forward.
 * Silently ignores unknown streamIds.
 */
export function applySkipRecurringInstances(
  projection: MonthlyProjection[],
  baseStreams: ForecastHistory['recurringStreams'],
  skips: ScenarioOverrides['skipRecurringInstances'],
): MonthlyProjection[] {
  if (!skips || skips.length === 0) return projection;

  const baseById = new Map(baseStreams.map((s) => [s.id, s]));

  // Same-reference fast path when no skip targets a month in the projection
  // (or all skips reference unknown streams). Keeps Task 10 composition cheap.
  const hasMatch = projection.some((m) =>
    skips.some((s) => s.skipMonth === m.month && baseById.has(s.streamId)),
  );
  if (!hasMatch) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const skip of skips) {
      if (skip.skipMonth !== month.month) continue;
      const stream = baseById.get(skip.streamId);
      if (!stream) continue;
      const monthly = monthlyEquivalent(stream.amount, stream.cadence);
      if (stream.direction === 'outflow') outflowDelta -= monthly;
      else inflowDelta -= monthly;
    }

    // Signed math (W-09): no per-applier clamp.
    const newInflows = month.inflows + inflowDelta;
    const newOutflows = month.outflows + outflowDelta;
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

/**
 * Apply one-time lump sums to specific months.
 * Positive amount → inflow; negative amount → outflow.
 * Multiple lump sums in the same month accumulate.
 * Re-chains endCash forward from the affected month.
 */
export function applyLumpSums(
  projection: MonthlyProjection[],
  lumpSums: ScenarioOverrides['lumpSums'],
): MonthlyProjection[] {
  if (!lumpSums || lumpSums.length === 0) return projection;

  // Same-reference fast path when no lump sum targets a month in the projection.
  const hasMatch = projection.some((m) =>
    lumpSums.some((s) => s.month === m.month),
  );
  if (!hasMatch) return projection;

  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    let inflowDelta = 0;
    let outflowDelta = 0;

    for (const sum of lumpSums) {
      if (sum.month !== month.month) continue;
      if (sum.amount >= 0) inflowDelta += sum.amount;
      else outflowDelta += -sum.amount;
    }

    const newInflows = month.inflows + inflowDelta;
    const newOutflows = month.outflows + outflowDelta;
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

/**
 * Clamp a projection's display-facing fields (inflows, outflows, byCategory
 * values) at 0 for rendering. Cash chain (startCash, endCash) is preserved
 * unclamped so the displayed result still reflects true cash math: a user
 * staring at `inflows: 0` AND `endCash: -3000` simultaneously can spot that
 * the scenario implies negative slack somewhere — that discrepancy IS the
 * warning signal that something is over-cut. Closes review W-09.
 *
 * Pure: input projection is not mutated.
 */
export function clampForDisplay(
  projection: MonthlyProjection[],
): MonthlyProjection[] {
  return projection.map((m) => ({
    ...m,
    inflows: Math.max(0, m.inflows),
    outflows: Math.max(0, m.outflows),
    byCategory: Object.fromEntries(
      Object.entries(m.byCategory).map(([k, v]) => [k, Math.max(0, v)]),
    ),
    // startCash and endCash unclamped — cash can be negative.
  }));
}
