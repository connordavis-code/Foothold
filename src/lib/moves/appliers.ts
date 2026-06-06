import type { ForecastHistory, MonthlyProjection } from '@/lib/forecast/types';

/**
 * R.4 Move appliers — pure functions that fold a single Move's effect into
 * a MonthlyProjection[] chain.
 *
 * See docs/redesign/r4-moves-scenarios/SPEC.md § Architecture > Engine refactor.
 *
 * Invariants preserved from the existing apply-overrides.ts engine
 * (CLAUDE.md > "Forecast override appliers use signed math"):
 *
 *   - Signed math through the chain. inflows / outflows / byCategory may go
 *     negative during composition. clampForDisplay (in apply-overrides for
 *     now; consolidated in T6) is the SINGLE clip point at render boundary.
 *
 *   - Each applier recomputes the startCash / endCash chain forward from
 *     the first month. Composition is associative: f(g(p)) === g(f(p))
 *     when both appliers preserve the chain. The commutativity test in
 *     apply.test.ts (T5) verifies this for the four-applier set.
 *
 *   - Empty / no-op params: early return the input unchanged. Same-reference
 *     fast path so T5's orchestrator can detect "nothing happened" cheaply.
 *
 * Engine-side `Move` shape is FLAT (kind discriminator + spread params)
 * for ergonomic applier dispatch. The DB-side shape is NESTED
 * ({ template_key, params }) — T6's apply.ts handles the mapping.
 */

// Cadence-to-monthly normalization. Duplicated from apply-overrides.ts
// (line 3-10) — T6's engine refactor will consolidate into a shared
// cadence.ts helper. Don't bother extracting now; the duplication is tiny.
const monthlyEquivalent = (
  amount: number,
  cadence: 'weekly' | 'biweekly' | 'monthly',
): number => {
  if (cadence === 'weekly') return amount * 4.333;
  if (cadence === 'biweekly') return amount * 2.167;
  return amount;
};

// =============================================================================
// Engine-side Move discriminated union (matches validation.ts but flat)
// =============================================================================

export type Move =
  | {
      kind: 'adjust-recurring';
      streamId: string;
      startMonth: string;
      endMonth?: string;
      newAmount: number; // monthly equivalent
    }
  | {
      kind: 'reduce-category';
      categoryKey: string;
      startMonth: string;
      endMonth?: string;
      deltaAmount: number; // positive magnitude; applier flips sign
    }
  | {
      kind: 'income-event';
      startMonth: string;
      endMonth?: string;
      monthlyAmount: number; // signed: positive = raise, negative = job loss
    }
  | {
      kind: 'skip-once';
      streamId: string;
      month: string;
    };

// =============================================================================
// Applier helpers
// =============================================================================

const inWindow = (
  month: string,
  startMonth: string,
  endMonth: string | undefined,
): boolean => month >= startMonth && (!endMonth || month <= endMonth);

const rebuildChain = (
  projection: MonthlyProjection[],
  perMonth: (m: MonthlyProjection) => Partial<MonthlyProjection>,
): MonthlyProjection[] => {
  const result: MonthlyProjection[] = [];
  let runningCash = projection.length > 0 ? projection[0].startCash : 0;

  for (const month of projection) {
    const patch = perMonth(month);
    const newInflows = patch.inflows ?? month.inflows;
    const newOutflows = patch.outflows ?? month.outflows;
    const startCash = runningCash;
    const endCash = startCash + newInflows - newOutflows;
    result.push({
      ...month,
      ...patch,
      startCash,
      inflows: newInflows,
      outflows: newOutflows,
      endCash,
    });
    runningCash = endCash;
  }

  return result;
};

// =============================================================================
// applyAdjustRecurring
// =============================================================================

/**
 * Set a recurring stream's monthly-equivalent amount over [startMonth, endMonth].
 *
 * Delta per affected month = newAmount − monthlyEquivalent(stream.amount,
 * stream.cadence). Applied to inflows or outflows per stream.direction.
 *
 * newAmount=0 = cancellation for the duration. endMonth=undefined =
 * permanent (cancel until horizon end).
 *
 * Unknown streamId: silent skip — same fault-tolerance as the existing
 * applyRecurringChanges.
 */
export function applyAdjustRecurring(
  projection: MonthlyProjection[],
  params: Extract<Move, { kind: 'adjust-recurring' }>,
  streams: ForecastHistory['recurringStreams'],
): MonthlyProjection[] {
  const stream = streams.find((s) => s.id === params.streamId);
  if (!stream) return projection;

  const orig = monthlyEquivalent(stream.amount, stream.cadence);
  const delta = params.newAmount - orig;
  if (delta === 0) return projection;

  return rebuildChain(projection, (month) => {
    if (!inWindow(month.month, params.startMonth, params.endMonth)) return {};
    if (stream.direction === 'outflow') {
      return { outflows: month.outflows + delta };
    }
    return { inflows: month.inflows + delta };
  });
}

// =============================================================================
// applyReduceCategory
// =============================================================================

/**
 * Reduce a category's outflow by deltaAmount/month over [startMonth, endMonth].
 *
 * Signed math: byCategory[categoryKey] may go negative if the reduction
 * exceeds the category's baseline — clampForDisplay at the render boundary
 * decides how to surface that information (a goal under "over-cut slack"
 * preserves the signal instead of silently rounding to zero).
 */
export function applyReduceCategory(
  projection: MonthlyProjection[],
  params: Extract<Move, { kind: 'reduce-category' }>,
): MonthlyProjection[] {
  if (params.deltaAmount === 0) return projection;

  return rebuildChain(projection, (month) => {
    if (!inWindow(month.month, params.startMonth, params.endMonth)) return {};
    const current = month.byCategory[params.categoryKey] ?? 0;
    return {
      outflows: month.outflows - params.deltaAmount,
      byCategory: {
        ...month.byCategory,
        [params.categoryKey]: current - params.deltaAmount,
      },
    };
  });
}

// =============================================================================
// applyIncomeEvent
// =============================================================================

/**
 * Add a signed monthly income delta over [startMonth, endMonth].
 *
 * monthlyAmount > 0: raise / sustained higher income.
 * monthlyAmount < 0: job loss / pay cut.
 *
 * If endMonth is undefined, the event runs until the horizon end. The
 * validation Zod refines monthlyAmount !== 0 so a no-op event can't reach
 * the applier.
 */
export function applyIncomeEvent(
  projection: MonthlyProjection[],
  params: Extract<Move, { kind: 'income-event' }>,
): MonthlyProjection[] {
  return rebuildChain(projection, (month) => {
    if (!inWindow(month.month, params.startMonth, params.endMonth)) return {};
    return { inflows: month.inflows + params.monthlyAmount };
  });
}

// =============================================================================
// applySkipOnce  (simulator-only)
// =============================================================================

/**
 * Skip a single instance of a recurring stream in a specific month.
 *
 * Subtracts the stream's monthly equivalent from inflows or outflows for
 * that month only — preserves the chain forward (subsequent months see
 * a one-time bump in endCash). Mirrors applySkipRecurringInstances from
 * the existing engine (single-skip case).
 *
 * Goal_move Zod rejects this template at the discriminator. Reaching this
 * function with a goal-move source is a validation bypass and would
 * indicate a server-action contract violation.
 *
 * Unknown streamId: silent skip.
 */
export function applySkipOnce(
  projection: MonthlyProjection[],
  params: Extract<Move, { kind: 'skip-once' }>,
  streams: ForecastHistory['recurringStreams'],
): MonthlyProjection[] {
  const stream = streams.find((s) => s.id === params.streamId);
  if (!stream) return projection;
  if (!projection.some((m) => m.month === params.month)) return projection;

  const monthly = monthlyEquivalent(stream.amount, stream.cadence);

  return rebuildChain(projection, (month) => {
    if (month.month !== params.month) return {};
    if (stream.direction === 'outflow') {
      return { outflows: month.outflows - monthly };
    }
    return { inflows: month.inflows - monthly };
  });
}
