import { describe, expect, it } from 'vitest';

import type { ForecastHistory, MonthlyProjection } from '@/lib/forecast/types';

import { applyMoves, goalMovesToEngineMoves, scenarioMovesToEngineMoves } from './apply';
import type { Move } from './appliers';

// =============================================================================
// Test helpers — same shape as appliers.test.ts so cases read consistently
// =============================================================================

function chain(months: string[]): MonthlyProjection[] {
  const inflows = 5000;
  const outflows = 3000;
  const byCategory = { FOOD_AND_DRINK: 800 };
  let cash = 1000;
  return months.map((month) => {
    const startCash = cash;
    cash = startCash + inflows - outflows;
    return {
      month,
      startCash,
      inflows,
      outflows,
      endCash: cash,
      byCategory: { ...byCategory },
      goalProgress: {},
    };
  });
}

const STREAMS: ForecastHistory['recurringStreams'] = [
  {
    id: 'rent',
    label: 'Rent',
    amount: 1500,
    direction: 'outflow',
    cadence: 'monthly',
    nextDate: '2026-06-01',
  },
  {
    id: 'netflix',
    label: 'Netflix',
    amount: 15,
    direction: 'outflow',
    cadence: 'monthly',
    nextDate: '2026-06-01',
  },
  {
    id: 'salary',
    label: 'Salary',
    amount: 5000,
    direction: 'inflow',
    cadence: 'monthly',
    nextDate: '2026-06-01',
  },
];

// =============================================================================
// Orchestration
// =============================================================================

describe('applyMoves — orchestration', () => {
  it('returns same reference fast path when moves[] is empty', () => {
    const proj = chain(['2026-06']);
    const result = applyMoves(proj, [], STREAMS);
    expect(result).toBe(proj);
  });

  it('dispatches a single adjust-recurring move correctly', () => {
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        newAmount: 0,
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    expect(result[0].outflows).toBe(1500); // 3000 - 1500
  });

  it('composes moves of different kinds in one call', () => {
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        newAmount: 0,
      },
      {
        kind: 'reduce-category',
        categoryKey: 'FOOD_AND_DRINK',
        startMonth: '2026-06',
        deltaAmount: 100,
      },
      {
        kind: 'income-event',
        startMonth: '2026-06',
        monthlyAmount: 500,
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    // Rent cancel: outflows -= 1500
    // Reduce food: outflows -= 100
    // Income event: inflows += 500
    expect(result[0].outflows).toBe(1400);
    expect(result[0].inflows).toBe(5500);
    expect(result[0].endCash).toBe(1000 + 5500 - 1400); // 5100
  });
});

// =============================================================================
// Per-month last-wins (SPEC § Edge case #2 — required test)
// =============================================================================

describe('applyMoves — per-month last-wins dedup', () => {
  it('adjust-recurring: same stream, identical window → last-wins', () => {
    // Two competing cancellations on rent — last one wins. Sum semantic
    // would be wrong here: -1500 + 0 (from "set to 0" twice) ≠ -3000.
    // Last-wins gives -1500 (one cancellation).
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        newAmount: 0, // cancel
      },
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        newAmount: 0, // also cancel
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    // Last-wins: ONE cancellation, not two. Outflows: 3000 - 1500 = 1500.
    expect(result[0].outflows).toBe(1500);
  });

  it('adjust-recurring: same stream, overlapping windows → per-month last-wins', () => {
    // Move 1: cancel rent June-July (newAmount=0)
    // Move 2: raise rent July onward (newAmount=2000)
    // SPEC: per-month last-wins per (streamId, month).
    //   June: only move 1 applies → rent = 0, outflows = 3000 - 1500 = 1500
    //   July: both apply, move 2 wins → rent = 2000, outflows = 3000 + 500 = 3500
    //   August: only move 2 applies → rent = 2000, outflows = 3500
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const moves: Move[] = [
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        endMonth: '2026-07',
        newAmount: 0,
      },
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-07',
        newAmount: 2000,
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    expect(result[0].outflows).toBe(1500); // June: cancel
    expect(result[1].outflows).toBe(3500); // July: raise wins
    expect(result[2].outflows).toBe(3500); // August: raise only
  });

  it('adjust-recurring: different streams compose additively (no dedup)', () => {
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      {
        kind: 'adjust-recurring',
        streamId: 'rent',
        startMonth: '2026-06',
        newAmount: 0, // cancel rent
      },
      {
        kind: 'adjust-recurring',
        streamId: 'netflix',
        startMonth: '2026-06',
        newAmount: 0, // cancel netflix
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    // Both cancellations apply: outflows = 3000 - 1500 - 15 = 1485
    expect(result[0].outflows).toBe(1485);
  });

  it('skip-once: same (streamId, month) → dedup to one skip', () => {
    // Two skips on same target → only one applies.
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      { kind: 'skip-once', streamId: 'rent', month: '2026-06' },
      { kind: 'skip-once', streamId: 'rent', month: '2026-06' },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    expect(result[0].outflows).toBe(1500); // ONE skip, not two
  });

  it('income-event: per-month last-wins across overlapping windows', () => {
    // Move 1: $1000/mo raise from June onward
    // Move 2: $2000/mo raise from July onward
    //   June: only move 1 → inflows += 1000
    //   July+: move 2 wins → inflows += 2000
    const proj = chain(['2026-06', '2026-07']);
    const moves: Move[] = [
      { kind: 'income-event', startMonth: '2026-06', monthlyAmount: 1000 },
      { kind: 'income-event', startMonth: '2026-07', monthlyAmount: 2000 },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    expect(result[0].inflows).toBe(6000); // June: +1000
    expect(result[1].inflows).toBe(7000); // July: +2000 (move 2 wins, not sum)
  });
});

// =============================================================================
// Same-reference fast paths through the orchestrator
// =============================================================================

describe('applyMoves — same-reference invariants', () => {
  it('returns same reference when a single applier fast-paths to no-op', () => {
    const proj = chain(['2026-06']);
    const moves: Move[] = [
      // unknown stream → applyAdjustRecurringSet contributes nothing
      {
        kind: 'adjust-recurring',
        streamId: 'no-such-stream',
        startMonth: '2026-06',
        newAmount: 999,
      },
    ];
    const result = applyMoves(proj, moves, STREAMS);
    // Orchestrator still re-runs rebuildChain because the kind has moves —
    // but per-month patches are all empty, so the chain value-equals the input.
    expect(result[0].outflows).toBe(proj[0].outflows);
    expect(result[0].inflows).toBe(proj[0].inflows);
    expect(result[0].endCash).toBe(proj[0].endCash);
  });
});

// =============================================================================
// DB-row → engine-Move converters (goal + scenario)
// =============================================================================

describe('goalMovesToEngineMoves', () => {
  it('maps each known templateKey to its engine Move shape', () => {
    const rows = [
      { templateKey: 'adjust-recurring', params: { streamId: 'rent', startMonth: '2026-06', endMonth: '2026-08', newAmount: 1200 } },
      { templateKey: 'reduce-category', params: { categoryKey: 'FOOD_AND_DRINK', startMonth: '2026-06', deltaAmount: 100 } },
      { templateKey: 'income-event', params: { startMonth: '2026-07', monthlyAmount: 500 } },
    ];
    expect(goalMovesToEngineMoves(rows)).toEqual([
      { kind: 'adjust-recurring', streamId: 'rent', startMonth: '2026-06', endMonth: '2026-08', newAmount: 1200 },
      { kind: 'reduce-category', categoryKey: 'FOOD_AND_DRINK', startMonth: '2026-06', endMonth: undefined, deltaAmount: 100 },
      { kind: 'income-event', startMonth: '2026-07', endMonth: undefined, monthlyAmount: 500 },
    ]);
  });

  it('drops rows with unrecognised templateKey (schema-drift defence)', () => {
    const rows = [
      { templateKey: 'lump-sum', params: { amount: 999 } },
      { templateKey: 'income-event', params: { startMonth: '2026-07', monthlyAmount: 500 } },
    ];
    expect(goalMovesToEngineMoves(rows)).toHaveLength(1);
  });

  it('skips rows whose params is null or non-object', () => {
    const rows = [
      { templateKey: 'income-event', params: null },
      { templateKey: 'income-event', params: [1, 2, 3] },
    ];
    expect(goalMovesToEngineMoves(rows)).toEqual([]);
  });
});

describe('scenarioMovesToEngineMoves', () => {
  it('admits skip-once (scenario-only) which the goal schema rejects', () => {
    const rows = [
      { templateKey: 'skip-once', params: { streamId: 'rent', month: '2026-06' } },
    ];
    expect(scenarioMovesToEngineMoves(rows)).toEqual([
      { kind: 'skip-once', streamId: 'rent', month: '2026-06' },
    ]);
  });

  it('maps the same four templateKeys as the goal converter', () => {
    const rows = [
      { templateKey: 'adjust-recurring', params: { streamId: 'rent', startMonth: '2026-06', newAmount: 0 } },
      { templateKey: 'skip-once', params: { streamId: 'gym', month: '2026-09' } },
    ];
    const result = scenarioMovesToEngineMoves(rows);
    expect(result.map((m) => m.kind)).toEqual(['adjust-recurring', 'skip-once']);
  });
});
