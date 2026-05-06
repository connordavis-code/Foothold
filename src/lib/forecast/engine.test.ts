import { describe, expect, it } from 'vitest';
import { projectCash } from './engine';
import type { ForecastHistory, ProjectCashInput } from './types';

// Architecture B (closes C-01): categoryHistory carries RAW PFC totals
// including recurring contributions, and incomeHistory carries RAW income
// including recurring inflows. Recurring streams are kept in the fixture
// because override appliers (pause/edit/skip) use that data, but they are
// no longer separately added to baseline math.
const baseHistory: ForecastHistory = {
  currentCash: 10_000,
  recurringStreams: [
    { id: 'salary', label: 'Salary', amount: 5000, direction: 'inflow', cadence: 'monthly', nextDate: '2026-05-15' },
    { id: 'rent', label: 'Rent', amount: 2000, direction: 'outflow', cadence: 'monthly', nextDate: '2026-05-01' },
  ],
  // rent is in PFC; dining + groceries are non-recurring categories.
  categoryHistory: {
    rent: [2000, 2000, 2000],
    dining: [400, 400, 400],
    groceries: [600, 600, 600],
  },
  // salary in income; no other inflow.
  incomeHistory: [5000, 5000, 5000],
  goals: [
    { id: 'ef', name: 'Emergency fund', targetAmount: 10_000, targetDate: null, monthlyContribution: 500, currentSaved: 4000 },
  ],
  categories: [
    { id: 'rent', name: 'Rent' },
    { id: 'dining', name: 'Dining' },
    { id: 'groceries', name: 'Groceries' },
  ],
};

describe('projectCash — integration', () => {
  it('returns horizon-length projection plus goal impacts', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: {},
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12); // default horizon
    expect(result.goalImpacts).toHaveLength(1);
  });

  it('respects overrides.horizonMonths', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 3 },
      currentMonth: '2026-05',
    };
    expect(projectCash(input).projection).toHaveLength(3);
  });

  it('baseline scenario: cash grows by salary − rent − dining − groceries each month', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 1 },
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    // 10000 + 5000 - 2000 - 400 - 600 = 12000
    expect(result.projection[0].endCash).toBe(12_000);
  });

  it('all 7 override types stacked produce a coherent projection', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: {
        horizonMonths: 12,
        categoryDeltas: [{ categoryId: 'dining', monthlyDelta: -200 }],
        incomeDelta: { monthlyDelta: 100 },
        recurringChanges: [{ streamId: 'rent', action: 'edit', amount: 1800 }],
        skipRecurringInstances: [{ streamId: 'salary', skipMonth: '2026-08' }],
        lumpSums: [{ id: 'tax', label: 'Tax refund', amount: 2400, month: '2026-04' }],
        hypotheticalGoals: [
          { id: 'travel', name: 'Travel fund', targetAmount: 3000, monthlyContribution: 250 },
        ],
        goalTargetEdits: [{ goalId: 'ef', newMonthlyContribution: 750 }],
      },
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12);

    // Dining cut → byCategory.dining = 200 (was 400)
    expect(result.projection[0].byCategory.dining).toBe(200);

    // Goal impacts include both real (ef) and hypothetical (hypo:travel)
    const ids = result.goalImpacts.map((g) => g.goalId).sort();
    expect(ids).toEqual(['ef', 'hypo:travel']);

    // ef: scenario contribution 750 should pull ETA earlier than baseline 500
    const ef = result.goalImpacts.find((g) => g.goalId === 'ef')!;
    expect(ef.shiftMonths).toBeLessThan(0);
  });

  it('handles empty history (just-connected user)', () => {
    const input: ProjectCashInput = {
      history: {
        currentCash: 0,
        recurringStreams: [],
        categoryHistory: {},
        incomeHistory: [],
        goals: [],
        categories: [],
      },
      overrides: {},
      currentMonth: '2026-05',
    };
    const result = projectCash(input);
    expect(result.projection).toHaveLength(12);
    expect(result.projection[0].endCash).toBe(0);
    expect(result.goalImpacts).toEqual([]);
  });

  it('is deterministic — same input produces same output across calls', () => {
    const input: ProjectCashInput = {
      history: baseHistory,
      overrides: { horizonMonths: 6, lumpSums: [{ id: 'x', label: 'x', amount: 100, month: '2026-07' }] },
      currentMonth: '2026-05',
    };
    const a = projectCash(input);
    const b = projectCash(input);
    expect(a).toEqual(b);
  });
});
