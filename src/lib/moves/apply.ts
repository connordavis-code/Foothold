import type {
  ForecastHistory,
  MonthlyProjection,
} from '@/lib/forecast/types';
import type { GoalMove } from '@/lib/db/schema';

import type { Move } from './appliers';

/**
 * Map DB-side GoalMove rows (nested templateKey + params) into the flat
 * engine-side Move discriminated union. Rows with unrecognised templateKey
 * are silently dropped — they can't have been inserted (validation.ts guards
 * the write boundary) but we defend here against schema drift.
 */
export function goalMovesToEngineMoves(rows: GoalMove[]): Move[] {
  const out: Move[] = [];
  for (const row of rows) {
    const { templateKey, params } = row;
    if (!params || typeof params !== 'object' || Array.isArray(params)) continue;
    const p = params as Record<string, unknown>;
    if (templateKey === 'adjust-recurring') {
      out.push({ kind: 'adjust-recurring', streamId: p.streamId as string, startMonth: p.startMonth as string, endMonth: p.endMonth as string | undefined, newAmount: p.newAmount as number });
    } else if (templateKey === 'reduce-category') {
      out.push({ kind: 'reduce-category', categoryKey: p.categoryKey as string, startMonth: p.startMonth as string, endMonth: p.endMonth as string | undefined, deltaAmount: p.deltaAmount as number });
    } else if (templateKey === 'income-event') {
      out.push({ kind: 'income-event', startMonth: p.startMonth as string, endMonth: p.endMonth as string | undefined, monthlyAmount: p.monthlyAmount as number });
    } else if (templateKey === 'skip-once') {
      out.push({ kind: 'skip-once', streamId: p.streamId as string, month: p.month as string });
    }
    // Unknown templateKey → skip.
  }
  return out;
}

/**
 * R.4 Move engine orchestrator.
 *
 * See docs/redesign/r4-moves-scenarios/SPEC.md § Architecture > Engine refactor.
 *
 * applyMoves(projection, moves, streams) folds a list of Moves into a
 * MonthlyProjection chain. Two layers of semantics:
 *
 *   1. Per-kind dispatch — each move kind has its own per-month resolution
 *      (set-appliers below). Moves of different kinds compose by chained
 *      application; commutative for non-overlapping inputs (proven by
 *      apply-commutativity.test.ts).
 *
 *   2. Per-month last-wins dedup — per SPEC § Edge case #2. When two moves
 *      of the same kind + same natural key both target the same month
 *      (overlapping windows on same streamId, etc.), only the LAST move
 *      in array order applies for that month. This is why we use
 *      set-appliers instead of looping per-move-applier-from-appliers.ts:
 *      sum semantics would give wrong answers on overlap.
 *
 * Natural keys per kind:
 *   adjust-recurring  → streamId   (last-wins per (streamId, month))
 *   reduce-category   → categoryKey (last-wins per (categoryKey, month))
 *   income-event      → (singleton) (last-wins per month)
 *   skip-once         → (streamId, month) exact match (dedup, not per-month dispatch)
 *
 * The T4 per-move appliers in appliers.ts remain the simpler primitives
 * for unit-testing and single-move scenarios; set-appliers here own the
 * SPEC-compliant composition semantics.
 */

// Cadence-to-monthly normalization. Duplicated from appliers.ts (which
// duplicates from apply-overrides.ts). T6's engine refactor consolidates.
const monthlyEquivalent = (
  amount: number,
  cadence: 'weekly' | 'biweekly' | 'monthly',
): number => {
  if (cadence === 'weekly') return amount * 4.333;
  if (cadence === 'biweekly') return amount * 2.167;
  return amount;
};

const inWindow = (
  month: string,
  startMonth: string,
  endMonth: string | undefined,
): boolean => month >= startMonth && (!endMonth || month <= endMonth);

// =============================================================================
// Top-level entry point
// =============================================================================

export function applyMoves(
  projection: MonthlyProjection[],
  moves: readonly Move[],
  streams: ForecastHistory['recurringStreams'],
): MonthlyProjection[] {
  if (moves.length === 0) return projection;

  // Partition by kind preserving array order (so per-month last-wins
  // resolves stably).
  const adjustRecurring: Array<Extract<Move, { kind: 'adjust-recurring' }>> = [];
  const reduceCategory: Array<Extract<Move, { kind: 'reduce-category' }>> = [];
  const incomeEvents: Array<Extract<Move, { kind: 'income-event' }>> = [];
  const skipOnces: Array<Extract<Move, { kind: 'skip-once' }>> = [];

  for (const move of moves) {
    if (move.kind === 'adjust-recurring') adjustRecurring.push(move);
    else if (move.kind === 'reduce-category') reduceCategory.push(move);
    else if (move.kind === 'income-event') incomeEvents.push(move);
    else skipOnces.push(move);
  }

  // Order between kinds is irrelevant — commutativity test pins this.
  let result = projection;
  if (adjustRecurring.length > 0) {
    result = applyAdjustRecurringSet(result, adjustRecurring, streams);
  }
  if (reduceCategory.length > 0) {
    result = applyReduceCategorySet(result, reduceCategory);
  }
  if (incomeEvents.length > 0) {
    result = applyIncomeEventSet(result, incomeEvents);
  }
  if (skipOnces.length > 0) {
    result = applySkipOnceSet(result, skipOnces, streams);
  }
  return result;
}

// =============================================================================
// Set-appliers — internal, expose via export only if T6/T9 need direct access
// =============================================================================

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

/**
 * adjust-recurring: per-month last-wins by streamId. For each month, find
 * the LAST move (by array order) targeting each streamId whose window
 * includes that month; apply its delta vs the stream's baseline.
 *
 * Different streams compose additively; same stream collisions resolve
 * last-wins. SPEC § Edge case #2.
 */
function applyAdjustRecurringSet(
  projection: MonthlyProjection[],
  moves: Array<Extract<Move, { kind: 'adjust-recurring' }>>,
  streams: ForecastHistory['recurringStreams'],
): MonthlyProjection[] {
  const streamById = new Map(streams.map((s) => [s.id, s]));

  return rebuildChain(projection, (month) => {
    // For each streamId, walk moves backward to find LAST in-window move.
    const winningByStream = new Map<
      string,
      Extract<Move, { kind: 'adjust-recurring' }>
    >();
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i];
      if (!inWindow(month.month, m.startMonth, m.endMonth)) continue;
      if (winningByStream.has(m.streamId)) continue;
      winningByStream.set(m.streamId, m);
    }
    if (winningByStream.size === 0) return {};

    let inflowDelta = 0;
    let outflowDelta = 0;
    for (const [streamId, m] of winningByStream) {
      const stream = streamById.get(streamId);
      if (!stream) continue;
      const orig = monthlyEquivalent(stream.amount, stream.cadence);
      const delta = m.newAmount - orig;
      if (delta === 0) continue;
      if (stream.direction === 'outflow') outflowDelta += delta;
      else inflowDelta += delta;
    }
    if (inflowDelta === 0 && outflowDelta === 0) return {};
    return {
      inflows: month.inflows + inflowDelta,
      outflows: month.outflows + outflowDelta,
    };
  });
}

/**
 * reduce-category: per-month last-wins by categoryKey. Per SPEC § Edge case
 * #7 the suggestion-chip layer suppresses duplicates, but the engine must
 * still resolve them correctly if they slip through.
 */
function applyReduceCategorySet(
  projection: MonthlyProjection[],
  moves: Array<Extract<Move, { kind: 'reduce-category' }>>,
): MonthlyProjection[] {
  return rebuildChain(projection, (month) => {
    const winningByCategory = new Map<
      string,
      Extract<Move, { kind: 'reduce-category' }>
    >();
    for (let i = moves.length - 1; i >= 0; i--) {
      const m = moves[i];
      if (!inWindow(month.month, m.startMonth, m.endMonth)) continue;
      if (winningByCategory.has(m.categoryKey)) continue;
      winningByCategory.set(m.categoryKey, m);
    }
    if (winningByCategory.size === 0) return {};

    let outflowDelta = 0;
    const newByCategory = { ...month.byCategory };
    for (const [categoryKey, m] of winningByCategory) {
      outflowDelta -= m.deltaAmount;
      const current = newByCategory[categoryKey] ?? 0;
      newByCategory[categoryKey] = current - m.deltaAmount;
    }
    return {
      outflows: month.outflows + outflowDelta,
      byCategory: newByCategory,
    };
  });
}

/**
 * income-event: per-month last-wins (single-valued income delta per month).
 * Two simultaneous income events on the same month → last in array wins.
 */
function applyIncomeEventSet(
  projection: MonthlyProjection[],
  moves: Array<Extract<Move, { kind: 'income-event' }>>,
): MonthlyProjection[] {
  return rebuildChain(projection, (month) => {
    let winning: Extract<Move, { kind: 'income-event' }> | undefined;
    for (let i = moves.length - 1; i >= 0; i--) {
      if (inWindow(month.month, moves[i].startMonth, moves[i].endMonth)) {
        winning = moves[i];
        break;
      }
    }
    if (!winning) return {};
    return { inflows: month.inflows + winning.monthlyAmount };
  });
}

/**
 * skip-once: dedup by (streamId, month) exact match. Two skips on the same
 * (stream, month) → one applies. Different streams or different months
 * compose additively.
 */
function applySkipOnceSet(
  projection: MonthlyProjection[],
  moves: Array<Extract<Move, { kind: 'skip-once' }>>,
  streams: ForecastHistory['recurringStreams'],
): MonthlyProjection[] {
  const streamById = new Map(streams.map((s) => [s.id, s]));

  // Dedup the move list once: same-month + same-stream → keep last only.
  const dedupedByKey = new Map<
    string,
    Extract<Move, { kind: 'skip-once' }>
  >();
  for (const m of moves) {
    dedupedByKey.set(`${m.streamId}:${m.month}`, m);
  }
  const deduped = [...dedupedByKey.values()];

  return rebuildChain(projection, (month) => {
    let inflowDelta = 0;
    let outflowDelta = 0;
    for (const m of deduped) {
      if (m.month !== month.month) continue;
      const stream = streamById.get(m.streamId);
      if (!stream) continue;
      const monthly = monthlyEquivalent(stream.amount, stream.cadence);
      if (stream.direction === 'outflow') outflowDelta -= monthly;
      else inflowDelta -= monthly;
    }
    if (inflowDelta === 0 && outflowDelta === 0) return {};
    return {
      inflows: month.inflows + inflowDelta,
      outflows: month.outflows + outflowDelta,
    };
  });
}
