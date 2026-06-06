import { describe, expect, it } from 'vitest';

import { suggestFromDrift, suggestFromHikes } from './move-suggestions';
import { type DriftAnalysis, type DriftFlag } from '@/lib/db/queries/drift';
import { type RecurringStreamRow } from '@/lib/db/queries/recurring';
import { type GoalWithProgress } from '@/lib/db/queries/goals';
import { type GoalMove } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDriftFlag(
  category: string,
  currentTotal: number,
  baselineWeekly: number,
): DriftFlag {
  return {
    category,
    weekStart: '2026-05-25',
    weekEnd: '2026-05-31',
    currentTotal,
    baselineWeekly,
    ratio: currentTotal / baselineWeekly,
  };
}

function makeDriftAnalysis(elevated: DriftFlag[]): DriftAnalysis {
  return {
    weekEnd: '2026-05-31',
    topCategories: [],
    currentlyElevated: elevated,
    flagHistory: [],
    leaderboard: [],
    weeks: 8,
    baselineSparse: false,
  };
}

function makeStream(
  overrides: Partial<RecurringStreamRow> & { id: string },
): RecurringStreamRow {
  return {
    plaidStreamId: `plaid-${overrides.id}`,
    direction: 'outflow',
    description: null,
    merchantName: null,
    frequency: 'monthly',
    averageAmount: 10,
    lastAmount: 12,
    firstDate: '2025-01-01',
    lastDate: '2026-05-01',
    predictedNextDate: null,
    isActive: true,
    status: 'active',
    primaryCategory: null,
    accountName: 'Checking',
    accountMask: '1234',
    ...overrides,
  };
}

// A goal stub — content irrelevant since both functions ignore it for
// scoping (drift surfaces whole-picture signal; hikes are goal-agnostic).
const stubGoal = {
  id: 'goal-1',
  name: 'Emergency fund',
  type: 'savings',
  targetAmount: 10000,
  monthlyAmount: null,
  accountIds: null,
  categoryFilter: null,
  targetDate: '2026-12-31',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  scopedAccountNames: [],
  progress: {
    type: 'savings',
    verdict: 'on-pace',
    currentAmount: 5000,
    targetAmount: 10000,
    fraction: 0.5,
    remaining: 5000,
    monthlyVelocity: 500,
    requiredMonthlyVelocity: 500,
  },
} as unknown as GoalWithProgress;

function makeGoalMove(
  templateKey: string,
  params: Record<string, unknown>,
): GoalMove {
  return {
    id: 'move-1',
    userId: 'user-1',
    goalId: 'goal-1',
    templateKey,
    params,
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as GoalMove;
}

// ---------------------------------------------------------------------------
// suggestFromDrift
// ---------------------------------------------------------------------------

describe('suggestFromDrift', () => {
  it('happy path — 2 elevated categories, no attached moves → 2 suggestions', () => {
    const analysis = makeDriftAnalysis([
      makeDriftFlag('FOOD_AND_DRINK', 200, 113),
      makeDriftFlag('ENTERTAINMENT', 80, 40),
    ]);

    const results = suggestFromDrift(analysis, stubGoal, []);

    expect(results).toHaveLength(2);

    const [dining, ent] = results;
    expect(dining.templateKey).toBe('reduce-category');
    expect(dining.source).toBe('drift');
    expect(dining.params.categoryKey).toBe('FOOD_AND_DRINK');
    // deltaAmount: (200 - 113) × (52/12) ≈ 376.33
    expect(dining.params.deltaAmount).toBeCloseTo((200 - 113) * (52 / 12), 1);
    expect(dining.params).not.toHaveProperty('newAmount');
    // humanizeCategory('FOOD_AND_DRINK') → 'Food and Drink'
    expect(dining.displayCopy).toContain('Food and Drink');
    expect(dining.displayCopy).toContain('3-mo avg');

    expect(ent.templateKey).toBe('reduce-category');
    expect(ent.params.categoryKey).toBe('ENTERTAINMENT');
    // deltaAmount: (80 - 40) × (52/12) ≈ 173.33
    expect(ent.params.deltaAmount).toBeCloseTo((80 - 40) * (52 / 12), 1);
  });

  it('cap at 3 — 5 elevated categories → exactly 3 suggestions', () => {
    const analysis = makeDriftAnalysis([
      makeDriftFlag('FOOD_AND_DRINK', 200, 100),
      makeDriftFlag('ENTERTAINMENT', 150, 60),
      makeDriftFlag('TRAVEL', 400, 100),
      makeDriftFlag('SHOPPING', 120, 50),
      makeDriftFlag('HEALTHCARE', 90, 30),
    ]);

    const results = suggestFromDrift(analysis, stubGoal, []);
    expect(results).toHaveLength(3);
  });

  it('suppression — category covered by attached reduce-category move is dropped', () => {
    const analysis = makeDriftAnalysis([
      makeDriftFlag('FOOD_AND_DRINK', 200, 113),
      makeDriftFlag('ENTERTAINMENT', 80, 40),
    ]);

    const attachedMove = makeGoalMove('reduce-category', {
      categoryKey: 'FOOD_AND_DRINK',
      startMonth: '2026-06',
      deltaAmount: 50,
    });

    const results = suggestFromDrift(analysis, stubGoal, [attachedMove]);

    expect(results).toHaveLength(1);
    expect(results[0].params.categoryKey).toBe('ENTERTAINMENT');
  });

  it('empty drift → returns []', () => {
    const analysis = makeDriftAnalysis([]);
    const results = suggestFromDrift(analysis, stubGoal, []);
    expect(results).toHaveLength(0);
  });

  it('returns deltaAmount (not newAmount) in drift suggestion params', () => {
    const analysis = makeDriftAnalysis([
      makeDriftFlag('FOOD_AND_DRINK', 200, 113),
    ]);

    const results = suggestFromDrift(analysis, stubGoal, []);

    expect(results[0].params).toHaveProperty('deltaAmount');
    expect(results[0].params).not.toHaveProperty('newAmount');
  });
});

// ---------------------------------------------------------------------------
// suggestFromHikes
// ---------------------------------------------------------------------------

describe('suggestFromHikes', () => {
  it('happy path — 2 hike-flagged streams, no attached moves → 2 suggestions', () => {
    const streams = [
      makeStream({
        id: 'stream-a',
        merchantName: 'Spotify',
        frequency: 'monthly',
        averageAmount: 10,
        lastAmount: 14,
      }),
      makeStream({
        id: 'stream-b',
        merchantName: 'Netflix',
        frequency: 'monthly',
        averageAmount: 15,
        lastAmount: 22,
      }),
    ];

    const results = suggestFromHikes(streams, stubGoal, []);

    expect(results).toHaveLength(2);

    // Sorting is by absolute delta descending: Netflix (22-15=7) before Spotify (14-10=4)
    const [first, second] = results;
    expect(first.templateKey).toBe('adjust-recurring');
    expect(first.source).toBe('hike');
    expect(first.params.streamId).toBe('stream-b');
    // newAmount should be monthly-equivalent; for monthly streams, it equals averageAmount
    expect(first.params.newAmount).toBe(15);
    expect(first.params).not.toHaveProperty('startMonth');
    expect(first.displayCopy).toMatch(/hiked from/);

    expect(second.templateKey).toBe('adjust-recurring');
    expect(second.params.streamId).toBe('stream-a');
    expect(second.params.newAmount).toBe(10);
  });

  it('cap at 3 — 5 hike-flagged streams → exactly 3 suggestions', () => {
    // All streams must pass isHikeAlert: >15% ratio + ≥$2/mo delta.
    const streams = [
      makeStream({ id: 's1', merchantName: 'A', averageAmount: 10, lastAmount: 14 }),
      makeStream({ id: 's2', merchantName: 'B', averageAmount: 10, lastAmount: 14 }),
      makeStream({ id: 's3', merchantName: 'C', averageAmount: 10, lastAmount: 14 }),
      makeStream({ id: 's4', merchantName: 'D', averageAmount: 10, lastAmount: 14 }),
      makeStream({ id: 's5', merchantName: 'E', averageAmount: 10, lastAmount: 14 }),
    ];

    const results = suggestFromHikes(streams, stubGoal, []);
    expect(results).toHaveLength(3);
  });

  it('suppression — stream covered by attached adjust-recurring move is dropped', () => {
    const streams = [
      makeStream({
        id: 'stream-a',
        merchantName: 'Spotify',
        frequency: 'monthly',
        averageAmount: 10,
        lastAmount: 14,
      }),
      makeStream({
        id: 'stream-b',
        merchantName: 'Netflix',
        frequency: 'monthly',
        averageAmount: 15,
        lastAmount: 22,
      }),
    ];

    const attachedMove = makeGoalMove('adjust-recurring', {
      streamId: 'stream-a',
      newAmount: 10,
      startMonth: '2026-06',
    });

    const results = suggestFromHikes(streams, stubGoal, [attachedMove]);

    expect(results).toHaveLength(1);
    expect(results[0].params.streamId).toBe('stream-b');
  });

  it('non-hike streams filtered out — only hike-flagged streams surface', () => {
    const streams = [
      // Qualifies: +40% hike, $4/mo delta
      makeStream({
        id: 'hike-stream',
        merchantName: 'Adobe',
        frequency: 'monthly',
        averageAmount: 10,
        lastAmount: 14,
      }),
      // Does NOT qualify: flat
      makeStream({
        id: 'flat-stream',
        merchantName: 'Dropbox',
        frequency: 'monthly',
        averageAmount: 10,
        lastAmount: 10,
      }),
      // Does NOT qualify: below 15% ratio
      makeStream({
        id: 'small-hike-stream',
        merchantName: 'iCloud',
        frequency: 'monthly',
        averageAmount: 10,
        lastAmount: 10.5,
      }),
      // Does NOT qualify: inflow direction
      makeStream({
        id: 'inflow-stream',
        merchantName: 'Payroll',
        direction: 'inflow',
        frequency: 'monthly',
        averageAmount: 1000,
        lastAmount: 1200,
      }),
    ];

    const results = suggestFromHikes(streams, stubGoal, []);

    expect(results).toHaveLength(1);
    expect(results[0].params.streamId).toBe('hike-stream');
    expect(results[0].params.newAmount).toBe(10);
    expect(results[0].displayCopy).toContain('Adobe');
  });
});
