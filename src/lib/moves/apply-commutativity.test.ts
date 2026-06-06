import { describe, expect, it } from 'vitest';

import type { ForecastHistory, MonthlyProjection } from '@/lib/forecast/types';

import { applyMoves } from './apply';
import type { Move } from './appliers';

/**
 * Commutativity tests for R.4's applyMoves engine.
 *
 * Ported from src/lib/forecast/apply-overrides-commutativity.test.ts
 * (the W-09 regression suite from 2026-05-05) — the same property must hold
 * for the new Move primitive: order of application doesn't matter for
 * non-overlapping inputs.
 *
 * This is the load-bearing safety net flagged in PLAN § Risk notes:
 *   "If commutativity breaks, the new engine has an order-dependence bug —
 *    debug before proceeding."
 *
 * Two property classes verified:
 *
 *   1. Different-kind pairs commute: applyMoves([a, b]) == applyMoves([b, a])
 *      across all 6 unique (kind × kind) pairs. Kinds compose by independent
 *      set-appliers in the orchestrator, so this should hold trivially —
 *      the test pins the property against future refactors.
 *
 *   2. Same-kind non-overlapping inputs commute: two adjust-recurring moves
 *      on DIFFERENT streams (or non-overlapping windows) commute. Same-key
 *      collisions resolve last-wins per SPEC § Edge case #2 — those are
 *      tested separately in apply.test.ts (last-wins IS order-dependent
 *      and intentionally so).
 */

function chain(months: string[]): MonthlyProjection[] {
  const inflows = 5000;
  const outflows = 3000;
  const byCategory = { FOOD_AND_DRINK: 800, TRANSPORTATION: 200 };
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

function expectProjectionsClose(
  a: MonthlyProjection[],
  b: MonthlyProjection[],
): void {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i].month).toBe(b[i].month);
    expect(a[i].inflows).toBeCloseTo(b[i].inflows, 6);
    expect(a[i].outflows).toBeCloseTo(b[i].outflows, 6);
    expect(a[i].startCash).toBeCloseTo(b[i].startCash, 6);
    expect(a[i].endCash).toBeCloseTo(b[i].endCash, 6);
    const aCats = Object.keys(a[i].byCategory);
    const bCats = Object.keys(b[i].byCategory);
    expect(aCats.sort()).toEqual(bCats.sort());
    for (const k of aCats) {
      expect(a[i].byCategory[k]).toBeCloseTo(b[i].byCategory[k], 6);
    }
  }
}

// =============================================================================
// Different-kind pair commutativity — all 6 unique pairs
// =============================================================================

describe('applyMoves — different-kind commutativity', () => {
  const adjust: Move = {
    kind: 'adjust-recurring',
    streamId: 'rent',
    startMonth: '2026-06',
    newAmount: 0,
  };
  const reduce: Move = {
    kind: 'reduce-category',
    categoryKey: 'FOOD_AND_DRINK',
    startMonth: '2026-06',
    deltaAmount: 100,
  };
  const income: Move = {
    kind: 'income-event',
    startMonth: '2026-06',
    monthlyAmount: 500,
  };
  const skip: Move = {
    kind: 'skip-once',
    streamId: 'netflix',
    month: '2026-06',
  };

  const proj = chain(['2026-06', '2026-07']);

  it('adjust-recurring ⇄ reduce-category', () => {
    expectProjectionsClose(
      applyMoves(proj, [adjust, reduce], STREAMS),
      applyMoves(proj, [reduce, adjust], STREAMS),
    );
  });

  it('adjust-recurring ⇄ income-event', () => {
    expectProjectionsClose(
      applyMoves(proj, [adjust, income], STREAMS),
      applyMoves(proj, [income, adjust], STREAMS),
    );
  });

  it('adjust-recurring ⇄ skip-once', () => {
    expectProjectionsClose(
      applyMoves(proj, [adjust, skip], STREAMS),
      applyMoves(proj, [skip, adjust], STREAMS),
    );
  });

  it('reduce-category ⇄ income-event', () => {
    expectProjectionsClose(
      applyMoves(proj, [reduce, income], STREAMS),
      applyMoves(proj, [income, reduce], STREAMS),
    );
  });

  it('reduce-category ⇄ skip-once', () => {
    expectProjectionsClose(
      applyMoves(proj, [reduce, skip], STREAMS),
      applyMoves(proj, [skip, reduce], STREAMS),
    );
  });

  it('income-event ⇄ skip-once', () => {
    expectProjectionsClose(
      applyMoves(proj, [income, skip], STREAMS),
      applyMoves(proj, [skip, income], STREAMS),
    );
  });
});

// =============================================================================
// Same-kind non-overlapping commutativity
// =============================================================================

describe('applyMoves — same-kind non-overlapping commutativity', () => {
  it('adjust-recurring on different streams commutes', () => {
    const proj = chain(['2026-06']);
    const rentCancel: Move = {
      kind: 'adjust-recurring',
      streamId: 'rent',
      startMonth: '2026-06',
      newAmount: 0,
    };
    const netflixCancel: Move = {
      kind: 'adjust-recurring',
      streamId: 'netflix',
      startMonth: '2026-06',
      newAmount: 0,
    };
    expectProjectionsClose(
      applyMoves(proj, [rentCancel, netflixCancel], STREAMS),
      applyMoves(proj, [netflixCancel, rentCancel], STREAMS),
    );
  });

  it('reduce-category on different categories commutes', () => {
    const proj = chain(['2026-06']);
    const reduceFood: Move = {
      kind: 'reduce-category',
      categoryKey: 'FOOD_AND_DRINK',
      startMonth: '2026-06',
      deltaAmount: 100,
    };
    const reduceTransport: Move = {
      kind: 'reduce-category',
      categoryKey: 'TRANSPORTATION',
      startMonth: '2026-06',
      deltaAmount: 50,
    };
    expectProjectionsClose(
      applyMoves(proj, [reduceFood, reduceTransport], STREAMS),
      applyMoves(proj, [reduceTransport, reduceFood], STREAMS),
    );
  });

  it('skip-once on different streams in same month commutes', () => {
    const proj = chain(['2026-06']);
    const skipRent: Move = {
      kind: 'skip-once',
      streamId: 'rent',
      month: '2026-06',
    };
    const skipNetflix: Move = {
      kind: 'skip-once',
      streamId: 'netflix',
      month: '2026-06',
    };
    expectProjectionsClose(
      applyMoves(proj, [skipRent, skipNetflix], STREAMS),
      applyMoves(proj, [skipNetflix, skipRent], STREAMS),
    );
  });

  it('income-event on non-overlapping windows commutes', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
    const earlyRaise: Move = {
      kind: 'income-event',
      startMonth: '2026-06',
      endMonth: '2026-06',
      monthlyAmount: 500,
    };
    const lateRaise: Move = {
      kind: 'income-event',
      startMonth: '2026-08',
      monthlyAmount: 1000,
    };
    expectProjectionsClose(
      applyMoves(proj, [earlyRaise, lateRaise], STREAMS),
      applyMoves(proj, [lateRaise, earlyRaise], STREAMS),
    );
  });
});

// =============================================================================
// Compose-all sanity: random-order vs. reverse-order produces same result
// =============================================================================

describe('applyMoves — full move-set order independence', () => {
  it('a full 4-kind move set commutes under reversal', () => {
    const proj = chain(['2026-06', '2026-07', '2026-08']);
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
        startMonth: '2026-07',
        monthlyAmount: 500,
      },
      {
        kind: 'skip-once',
        streamId: 'netflix',
        month: '2026-08',
      },
    ];

    expectProjectionsClose(
      applyMoves(proj, moves, STREAMS),
      applyMoves(proj, [...moves].reverse(), STREAMS),
    );
  });
});
