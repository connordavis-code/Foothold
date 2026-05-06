import { describe, expect, it } from 'vitest';
import { computeGoalImpacts } from './goal-projection';
import type { ForecastHistory, MonthlyProjection, ScenarioOverrides } from './types';

const baseGoal: ForecastHistory['goals'][number] = {
  id: 'ef',
  name: 'Emergency fund',
  targetAmount: 10_000,
  targetDate: null,
  monthlyContribution: 500,
  currentSaved: 4000,
};

const noOverrides: ScenarioOverrides = {};

function flatProjection(months: string[], end = 1000): MonthlyProjection[] {
  return months.map((m) => ({
    month: m, startCash: end, inflows: 0, outflows: 0, endCash: end,
    byCategory: {}, goalProgress: {},
  }));
}

describe('computeGoalImpacts', () => {
  it('returns empty array when there are no goals', () => {
    const proj = flatProjection(['2026-05']);
    const result = computeGoalImpacts(proj, proj, [], noOverrides);
    expect(result).toEqual([]);
  });

  it('finds ETA = first month where (currentSaved + cumulative contribution) >= target', () => {
    // 4000 saved, 500/mo contribution, 10000 target → need 12 more months
    const proj = flatProjection(
      Array.from({ length: 14 }, (_, i) => {
        const monthOffset = i + 5;
        const year = 2026 + Math.floor((monthOffset - 1) / 12);
        const month = ((monthOffset - 1) % 12) + 1;
        return `${year}-${String(month).padStart(2, '0')}`;
      }),
    );
    // months[0]='2026-05', month index 12 (0-indexed 11) = '2027-04'
    const result = computeGoalImpacts(proj, proj, [baseGoal], noOverrides);
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe('ef');
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2027-04');
    expect(result[0].shiftMonths).toBe(0);
  });

  it('returns null ETA when target is unreachable within horizon', () => {
    // Target 100000, saved 4000, 500/mo → would need 192 months
    const proj = flatProjection(['2026-05', '2026-06']);
    const goal = { ...baseGoal, targetAmount: 100_000 };
    const result = computeGoalImpacts(proj, proj, [goal], noOverrides);
    expect(result[0].baselineETA).toBeNull();
    expect(result[0].scenarioETA).toBeNull();
    expect(result[0].shiftMonths).toBe(0);
  });

  it('reports shiftMonths < 0 when scenario contribution is higher than baseline', () => {
    // Apply a goalTargetEdit raising monthlyContribution from 500 to 1000
    const months = Array.from({ length: 14 }, (_, i) => {
      const monthOffset = i + 5;
      const year = 2026 + Math.floor((monthOffset - 1) / 12);
      const month = ((monthOffset - 1) % 12) + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    });
    const baseline = flatProjection(months);
    const scenario = baseline;
    const overrides: ScenarioOverrides = {
      goalTargetEdits: [{ goalId: 'ef', newMonthlyContribution: 1000 }],
    };
    const result = computeGoalImpacts(baseline, scenario, [baseGoal], overrides);
    // Baseline: 4000 + 500*12 = hits month 12 (Apr 2027)
    // Scenario: 4000 + 1000*6 = hits month 6 (Oct 2026)
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2026-10');
    expect(result[0].shiftMonths).toBe(-6);
  });

  it('includes hypothetical goals with id prefixed "hypo:"', () => {
    const months = Array.from({ length: 14 }, (_, i) => {
      const monthOffset = i + 5;
      const year = 2026 + Math.floor((monthOffset - 1) / 12);
      const month = ((monthOffset - 1) % 12) + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    });
    const proj = flatProjection(months);
    const overrides: ScenarioOverrides = {
      hypotheticalGoals: [
        { id: 'h1', name: 'House', targetAmount: 5000, monthlyContribution: 500 },
      ],
    };
    const result = computeGoalImpacts(proj, proj, [], overrides);
    expect(result).toHaveLength(1);
    expect(result[0].goalId).toBe('hypo:h1');
    expect(result[0].name).toBe('House');
    expect(result[0].baselineETA).toBeNull();
    // Scenario: 0 + 500*10 = 5000 → hits month 10 (Feb 2027)
    expect(result[0].scenarioETA).toBe('2027-02');
  });

  it('reports shiftMonths > 0 when scenario contribution is lower than baseline', () => {
    const months = Array.from({ length: 24 }, (_, i) => {
      const monthOffset = i + 5;
      const year = 2026 + Math.floor((monthOffset - 1) / 12);
      const month = ((monthOffset - 1) % 12) + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    });
    const baseline = flatProjection(months);
    const overrides: ScenarioOverrides = {
      goalTargetEdits: [{ goalId: 'ef', newMonthlyContribution: 250 }],
    };
    const result = computeGoalImpacts(baseline, baseline, [baseGoal], overrides);
    // Baseline: 4000 + 500*12 = Apr 2027 (month 12)
    // Scenario: 4000 + 250*24 = Apr 2028 (month 24); we have 24 months in horizon
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2028-04');
    expect(result[0].shiftMonths).toBe(12);
  });

  it('handles a hypothetical goal with no monthlyContribution (never reaches target)', () => {
    const proj = flatProjection(['2026-05', '2026-06']);
    const overrides: ScenarioOverrides = {
      hypotheticalGoals: [
        { id: 'h1', name: 'Untracked', targetAmount: 5000 }, // no monthlyContribution
      ],
    };
    const result = computeGoalImpacts(proj, proj, [], overrides);
    expect(result[0].scenarioETA).toBeNull();
  });

  // Regression for review finding W-01. findGoalETA must skip months
  // where end-of-month cash can't support the contribution; otherwise
  // the simulator reports a feasible ETA on a projection that itself
  // shows the user underwater.
  describe('cash gate (W-01)', () => {
    function projectionWithCash(months: string[], endCash: number[]): MonthlyProjection[] {
      return months.map((m, i) => ({
        month: m,
        startCash: endCash[i] ?? 0,
        inflows: 0,
        outflows: 0,
        endCash: endCash[i] ?? 0,
        byCategory: {},
        goalProgress: {},
      }));
    }

    it('skips contribution in months where endCash < monthlyContribution', () => {
      // Goal needs 6 months of $500 to hit $7000 (4000 saved + 6 × 500).
      // But months 1, 2, 3 have endCash = $300 — can't afford $500 contribution.
      // Months 4, 5, 6, 7, 8, 9 have endCash = $2000 — fine.
      // Original code: ETA = month 6 (always counts contribution).
      // Fixed code: ETA = month 9 (skips first 3 months of underwater cash).
      const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
                      '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'];
      const cashSeries = [300, 300, 300, 2000, 2000, 2000, 2000, 2000, 2000, 2000];
      const proj = projectionWithCash(months, cashSeries);
      const goal = { ...baseGoal, targetAmount: 7000 };
      const result = computeGoalImpacts(proj, proj, [goal], noOverrides);
      expect(result[0].scenarioETA).toBe('2027-01');
    });

    it('returns null ETA when every month is underwater', () => {
      // Permanent negative cash trajectory — no contribution ever counts.
      const months = ['2026-05', '2026-06', '2026-07'];
      const proj = projectionWithCash(months, [-100, -200, -300]);
      const result = computeGoalImpacts(proj, proj, [baseGoal], noOverrides);
      expect(result[0].scenarioETA).toBeNull();
    });

    it('ignores cash gate when contribution is zero', () => {
      // Zero-contribution goal: gate is endCash >= 0, which is satisfied
      // even on tight budgets. ETA stays null because target unreachable.
      const months = ['2026-05', '2026-06'];
      const proj = projectionWithCash(months, [50, 50]);
      const goal = { ...baseGoal, monthlyContribution: 0 };
      const result = computeGoalImpacts(proj, proj, [goal], noOverrides);
      expect(result[0].scenarioETA).toBeNull();
    });
  });

  it('uses goalTargetEdits.newTargetAmount when present', () => {
    const months = Array.from({ length: 14 }, (_, i) => {
      const monthOffset = i + 5;
      const year = 2026 + Math.floor((monthOffset - 1) / 12);
      const month = ((monthOffset - 1) % 12) + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    });
    const proj = flatProjection(months);
    const overrides: ScenarioOverrides = {
      goalTargetEdits: [{ goalId: 'ef', newTargetAmount: 5000 }], // halve target
    };
    const result = computeGoalImpacts(proj, proj, [baseGoal], overrides);
    // Baseline: target 10000, hits month 12 (Apr 2027)
    // Scenario: target 5000, 4000 + 500*2 = 5000 → hits month 2 (Jun 2026)
    expect(result[0].baselineETA).toBe('2027-04');
    expect(result[0].scenarioETA).toBe('2026-06');
    expect(result[0].shiftMonths).toBe(-10);
  });
});
