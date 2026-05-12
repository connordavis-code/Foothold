import { describe, it, expect } from 'vitest';
import { deriveChartMarkers } from './markers';
import type { MonthlyProjection, GoalImpact } from '@/lib/forecast/types';

function projection(months: { month: string; endCash: number }[]): MonthlyProjection[] {
  return months.map((m) => ({
    month: m.month,
    startCash: 0,
    inflows: 0,
    outflows: 0,
    endCash: m.endCash,
    byCategory: {},
    goalProgress: {},
  }));
}

describe('deriveChartMarkers', () => {
  const baseline = projection([
    { month: '2026-06', endCash: 5000 },
    { month: '2026-07', endCash: 3000 },
    { month: '2026-08', endCash: 1000 },
    { month: '2026-09', endCash: -500 }, // depletion here
    { month: '2026-10', endCash: -2000 },
    { month: '2026-11', endCash: -3500 },
  ]);
  const scenario = projection([
    { month: '2026-06', endCash: 5000 },
    { month: '2026-07', endCash: 4000 },
    { month: '2026-08', endCash: 3000 },
    { month: '2026-09', endCash: 2500 },
    { month: '2026-10', endCash: 2000 },
    { month: '2026-11', endCash: 1500 },
  ]);

  it('emits runway-depleted marker against baseline only', () => {
    const markers = deriveChartMarkers(baseline, scenario, [], '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'runwayDepleted')).toHaveLength(1);
    expect(markers.find((m) => m.kind === 'runwayDepleted')).toMatchObject({
      kind: 'runwayDepleted',
      monthIndex: 3, // 2026-09 is index 3 from 2026-06
    });
  });

  it('omits runway-depleted when baseline never goes negative in the visible range', () => {
    const safe = projection([
      { month: '2026-06', endCash: 5000 },
      { month: '2026-07', endCash: 4500 },
    ]);
    const markers = deriveChartMarkers(safe, safe, [], '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'runwayDepleted')).toHaveLength(0);
  });

  it('emits goal-arrival markers in visible range', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Emergency Fund', baselineETA: '2027-09', scenarioETA: '2027-02', shiftMonths: -7 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    const arrivals = markers.filter((m) => m.kind === 'goalArrival');
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toMatchObject({
      kind: 'goalArrival',
      goalName: 'Emergency Fund',
    });
  });

  it('drops goal-arrival markers outside the visible range', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Far Goal', baselineETA: '2028-09', scenarioETA: '2028-02', shiftMonths: -7 },
    ];
    // 1Y from 2026-06 = visible through 2027-05; 2028 falls outside.
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '1Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(0);
  });

  it('caps goal-arrival markers at 3', () => {
    const goalImpacts: GoalImpact[] = Array.from({ length: 5 }, (_, i) => ({
      goalId: `g${i}`,
      name: `Goal ${i}`,
      baselineETA: '2027-03',
      scenarioETA: '2027-03',
      shiftMonths: 0,
    }));
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(3);
  });

  it('caps to the 3 earliest goal arrivals when more than 3 fall in range', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'late', name: 'Late', baselineETA: '2027-10', scenarioETA: '2027-10', shiftMonths: 0 },
      { goalId: 'early1', name: 'Early1', baselineETA: '2026-08', scenarioETA: '2026-08', shiftMonths: 0 },
      { goalId: 'mid', name: 'Mid', baselineETA: '2027-02', scenarioETA: '2027-02', shiftMonths: 0 },
      { goalId: 'early2', name: 'Early2', baselineETA: '2026-10', scenarioETA: '2026-10', shiftMonths: 0 },
      { goalId: 'early3', name: 'Early3', baselineETA: '2026-12', scenarioETA: '2026-12', shiftMonths: 0 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    const arrivals = markers.filter((m) => m.kind === 'goalArrival');
    expect(arrivals).toHaveLength(3);
    expect(arrivals.map((m) => (m as { goalName: string }).goalName)).toEqual([
      'Early1',  // monthIndex 2
      'Early2',  // monthIndex 4
      'Early3',  // monthIndex 6
    ]);
  });

  it('drops goals with null scenarioETA', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Unreachable', baselineETA: null, scenarioETA: null, shiftMonths: 0 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    expect(markers.filter((m) => m.kind === 'goalArrival')).toHaveLength(0);
  });

  it('handles empty baseline', () => {
    expect(() => deriveChartMarkers([], [], [], '2026-06', '1Y')).not.toThrow();
    expect(deriveChartMarkers([], [], [], '2026-06', '1Y')).toEqual([]);
  });

  it('orders markers by monthIndex ascending', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'g1', name: 'Late', baselineETA: '2027-04', scenarioETA: '2027-04', shiftMonths: 0 },
      { goalId: 'g2', name: 'Early', baselineETA: '2026-12', scenarioETA: '2026-12', shiftMonths: 0 },
    ];
    const markers = deriveChartMarkers(baseline, scenario, goalImpacts, '2026-06', '2Y');
    const indices = markers.map((m) => m.monthIndex);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });
});
