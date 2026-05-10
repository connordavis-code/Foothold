import { describe, expect, it } from 'vitest';
import {
  buildGoalMatrix,
  computeEndDelta,
  MAX_COMPARE_SCENARIOS,
  parseScenariosQuery,
  pickScenarioColor,
} from './comparison';
import type { GoalImpact, MonthlyProjection } from './types';

const proj = (month: string, endCash: number): MonthlyProjection => ({
  month,
  startCash: 0,
  inflows: 0,
  outflows: 0,
  endCash,
  byCategory: {},
  goalProgress: {},
});

describe('pickScenarioColor', () => {
  it('returns chart-1..6 in order', () => {
    expect(pickScenarioColor(0)).toBe('--chart-1');
    expect(pickScenarioColor(1)).toBe('--chart-2');
    expect(pickScenarioColor(2)).toBe('--chart-3');
  });

  it('cycles past index 6 rather than throwing', () => {
    expect(pickScenarioColor(6)).toBe('--chart-1');
    expect(pickScenarioColor(11)).toBe('--chart-6');
  });
});

describe('computeEndDelta', () => {
  it('computes signed last-month delta', () => {
    const baseline = [proj('2026-06', 1000), proj('2026-07', 2000)];
    const scenario = [proj('2026-06', 800), proj('2026-07', 2500)];
    expect(computeEndDelta(scenario, baseline)).toEqual({
      absolute: 500,
      percent: 25,
    });
  });

  it('returns negative when scenario underperforms baseline', () => {
    const baseline = [proj('2026-06', 1000)];
    const scenario = [proj('2026-06', 600)];
    expect(computeEndDelta(scenario, baseline)).toEqual({
      absolute: -400,
      percent: -40,
    });
  });

  it('returns null percent when baseline endCash is 0 (avoid div-by-zero)', () => {
    const baseline = [proj('2026-06', 0)];
    const scenario = [proj('2026-06', 500)];
    expect(computeEndDelta(scenario, baseline)).toEqual({
      absolute: 500,
      percent: null,
    });
  });

  it('uses |baseline| in denominator so a negative baseline shows correct sign on percent', () => {
    // Baseline projects you running out: -$1000. Scenario softens that
    // to -$500. Delta is +$500 (a "win"); percent is +50% of |baseline|.
    const baseline = [proj('2026-06', -1000)];
    const scenario = [proj('2026-06', -500)];
    expect(computeEndDelta(scenario, baseline)).toEqual({
      absolute: 500,
      percent: 50,
    });
  });

  it('returns 0 absolute / null percent for empty arrays (defensive)', () => {
    expect(computeEndDelta([], [proj('2026-06', 1000)])).toEqual({
      absolute: 0,
      percent: null,
    });
    expect(computeEndDelta([proj('2026-06', 1000)], [])).toEqual({
      absolute: 0,
      percent: null,
    });
  });
});

describe('parseScenariosQuery', () => {
  it('parses a comma-separated list', () => {
    expect(parseScenariosQuery('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace + drops empty entries', () => {
    expect(parseScenariosQuery(' a , ,b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('dedupes', () => {
    expect(parseScenariosQuery('a,b,a,c,b')).toEqual(['a', 'b', 'c']);
  });

  it('caps at MAX_COMPARE_SCENARIOS', () => {
    expect(MAX_COMPARE_SCENARIOS).toBe(3);
    expect(parseScenariosQuery('a,b,c,d,e')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for missing / empty input', () => {
    expect(parseScenariosQuery(undefined)).toEqual([]);
    expect(parseScenariosQuery('')).toEqual([]);
    expect(parseScenariosQuery(',,,')).toEqual([]);
  });

  it('takes first value when Next passes string[] (repeated query keys)', () => {
    expect(parseScenariosQuery(['a,b', 'c'])).toEqual(['a', 'b']);
  });
});

describe('buildGoalMatrix', () => {
  const goalA: GoalImpact = {
    goalId: 'goal-a',
    name: 'Emergency fund',
    baselineETA: '2026-12',
    scenarioETA: '2026-09',
    shiftMonths: -3,
  };
  const goalB: GoalImpact = {
    goalId: 'goal-b',
    name: 'Travel',
    baselineETA: null,
    scenarioETA: null,
    shiftMonths: 0,
  };
  const hypoX: GoalImpact = {
    goalId: 'hypo:travel',
    name: 'New travel fund',
    baselineETA: null,
    scenarioETA: '2027-04',
    shiftMonths: 0,
  };

  it('returns empty for zero scenarios', () => {
    expect(buildGoalMatrix([])).toEqual([]);
  });

  it('builds rows for each unique goal across scenarios', () => {
    const matrix = buildGoalMatrix([
      { id: 's1', name: 'Aggressive', goalImpacts: [goalA, goalB] },
      { id: 's2', name: 'Conservative', goalImpacts: [goalA] },
    ]);
    expect(matrix.map((r) => r.goalId)).toEqual(['goal-a', 'goal-b']);
    const a = matrix.find((r) => r.goalId === 'goal-a')!;
    expect(a.baseline).toBe('2026-12');
    expect(a.scenarios.s1).toEqual({ eta: '2026-09', shiftMonths: -3 });
    expect(a.scenarios.s2).toEqual({ eta: '2026-09', shiftMonths: -3 });
  });

  it('marks scenarios that do NOT define a goal as eta=null shiftMonths=null', () => {
    const matrix = buildGoalMatrix([
      { id: 's1', name: 'A', goalImpacts: [goalA, hypoX] },
      { id: 's2', name: 'B', goalImpacts: [goalA] }, // no hypoX
    ]);
    const hypoRow = matrix.find((r) => r.goalId === 'hypo:travel')!;
    expect(hypoRow.scenarios.s1).toEqual({ eta: '2027-04', shiftMonths: 0 });
    expect(hypoRow.scenarios.s2).toEqual({ eta: null, shiftMonths: null });
  });

  it('sorts real goals before hypothetical, alpha within each group', () => {
    const matrix = buildGoalMatrix([
      {
        id: 's1',
        name: 'A',
        goalImpacts: [
          hypoX,
          goalB, // Travel
          goalA, // Emergency fund
        ],
      },
    ]);
    expect(matrix.map((r) => r.goalId)).toEqual([
      'goal-a',     // "Emergency fund" (real, alpha first)
      'goal-b',     // "Travel" (real, alpha second)
      'hypo:travel', // hypothetical last
    ]);
  });

  it('coerces shiftMonths to null when scenarioETA is null (unreachable)', () => {
    const unreachable: GoalImpact = {
      goalId: 'goal-c',
      name: 'Big house',
      baselineETA: '2027-06',
      scenarioETA: null,
      shiftMonths: 0, // engine returns 0 for null ETAs; matrix coerces
    };
    const matrix = buildGoalMatrix([
      { id: 's1', name: 'A', goalImpacts: [unreachable] },
    ]);
    expect(matrix[0].scenarios.s1).toEqual({ eta: null, shiftMonths: null });
  });
});
