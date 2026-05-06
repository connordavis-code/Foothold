import { describe, expect, it } from 'vitest';
import { buildForecastPrompt } from './forecast-prompt';
import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from '@/lib/forecast/types';

const baseHistory: ForecastHistory = {
  currentCash: 13_400,
  recurringStreams: [],
  categoryHistory: {},
  incomeHistory: [],
  goals: [
    { id: 'ef', name: 'Emergency fund', targetAmount: 10_000, targetDate: null, monthlyContribution: 500, currentSaved: 4_200 },
  ],
  categories: [
    { id: 'FOOD_AND_DRINK', name: 'Food and drink' },
  ],
};

const flat = (months: string[], end = 13_400): MonthlyProjection[] =>
  months.map((m) => ({
    month: m, startCash: end, inflows: 0, outflows: 0, endCash: end,
    byCategory: {}, goalProgress: {},
  }));

describe('buildForecastPrompt', () => {
  it('contains the CURRENT STATE section with cash + active goals', () => {
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('CURRENT STATE');
    expect(prompt).toContain('$13,400');
    expect(prompt).toContain('Emergency fund');
    expect(prompt).toContain('$10,000');
    expect(prompt).toContain('$4,200');
  });

  it('contains a SCENARIO OVERRIDES section listing active categories cuts', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [
        { categoryId: 'FOOD_AND_DRINK', monthlyDelta: -300 },
      ],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('SCENARIO OVERRIDES');
    expect(prompt).toContain('Food and drink');
    expect(prompt).toContain('-$300/mo');
  });

  it('contains lump sum entries with month + amount sign', () => {
    const overrides: ScenarioOverrides = {
      lumpSums: [
        { id: 'tax', label: 'Tax refund', amount: 2_400, month: '2026-04' },
        { id: 'vet', label: 'Vet bill', amount: -800, month: '2026-06' },
      ],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('Tax refund');
    expect(prompt).toContain('+$2,400');
    expect(prompt).toContain('Vet bill');
    expect(prompt).toContain('-$800');
  });

  it('contains a PROJECTION DELTA section with baseline + scenario end cash', () => {
    const baseline = flat(['2026-05', '2026-06'], 19_400);
    const scenario = flat(['2026-05', '2026-06'], 24_800);
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: baseline,
      scenarioProjection: scenario,
      goalImpacts: [],
    });
    expect(prompt).toContain('PROJECTION DELTA');
    expect(prompt).toContain('$19,400');
    expect(prompt).toContain('$24,800');
    expect(prompt).toContain('+$5,400');
  });

  it('contains GOAL IMPACTS section with shifted ETAs', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'ef', name: 'Emergency fund', baselineETA: '2026-08', scenarioETA: '2026-06', shiftMonths: -2 },
    ];
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts,
    });
    expect(prompt).toContain('GOAL IMPACTS');
    expect(prompt).toContain('Emergency fund');
    expect(prompt).toContain('2026-08');
    expect(prompt).toContain('2026-06');
    expect(prompt).toContain('2mo sooner');
  });

  it('marks hypothetical goals as "(hypo)"', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'hypo:h1', name: 'House', baselineETA: null, scenarioETA: '2029-03', shiftMonths: 0 },
    ];
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts,
    });
    expect(prompt).toContain('House (hypo)');
    expect(prompt).toContain('2029-03');
  });

  it('resolves goalTargetEdits goalId to goal name from history', () => {
    const overrides: ScenarioOverrides = {
      goalTargetEdits: [
        { goalId: 'ef', newMonthlyContribution: 700 },
        { goalId: 'unknown-goal-id', newTargetAmount: 5_000 },
      ],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    // known id → human name
    expect(prompt).toContain('Emergency fund (contribution → $700/mo)');
    // unknown id → falls back to raw id (still readable, doesn't crash)
    expect(prompt).toContain('unknown-goal-id (target → $5,000)');
  });

  it('omits SCENARIO OVERRIDES section when no overrides are active', () => {
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).not.toContain('SCENARIO OVERRIDES');
  });

  it('total length stays under ~2000 chars for a typical scenario', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [{ categoryId: 'FOOD_AND_DRINK', monthlyDelta: -300 }],
      lumpSums: [{ id: 'tax', label: 'Tax refund', amount: 2_400, month: '2026-04' }],
      hypotheticalGoals: [{ id: 'h1', name: 'House', targetAmount: 30_000, monthlyContribution: 500 }],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt.length).toBeLessThan(2000);
  });
});
