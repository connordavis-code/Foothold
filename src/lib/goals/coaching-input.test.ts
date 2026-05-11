import { describe, expect, it } from 'vitest';
import { buildCoachingInput, computeRequiredMonthlyVelocity } from './coaching-input';
import type { GoalWithProgress } from '@/lib/db/queries/goals';

const savingsGoal = (
  overrides: Partial<{
    fraction: number;
    monthlyVelocity: number;
    projectedDate: string | null;
    targetDate: string | null;
    current: number;
    target: number;
    remaining: number;
  }> = {},
): GoalWithProgress =>
  ({
    id: 'g1',
    name: 'Test Savings',
    type: 'savings',
    targetAmount: overrides.target ?? 10000,
    monthlyAmount: null,
    accountIds: null,
    categoryFilter: null,
    targetDate: overrides.targetDate === undefined ? '2027-01-01' : overrides.targetDate,
    isActive: true,
    createdAt: new Date(),
    scopedAccountNames: [],
    progress: {
      type: 'savings',
      current: overrides.current ?? 5000,
      target: overrides.target ?? 10000,
      fraction: overrides.fraction ?? 0.5,
      remaining: overrides.remaining ?? 5000,
      monthlyVelocity: overrides.monthlyVelocity ?? 400,
      monthsToTarget: null,
      projectedDate: overrides.projectedDate ?? '2027-06-01',
    },
  }) as GoalWithProgress;

const spendCapGoal = (
  overrides: Partial<{
    fraction: number;
    spent: number;
    cap: number;
    projectedMonthly: number;
    remaining: number;
  }> = {},
): GoalWithProgress =>
  ({
    id: 'g2',
    name: 'Test Cap',
    type: 'spend_cap',
    targetAmount: null,
    monthlyAmount: overrides.cap ?? 400,
    accountIds: null,
    categoryFilter: ['FOOD_AND_DRINK'],
    targetDate: null,
    isActive: true,
    createdAt: new Date(),
    scopedAccountNames: [],
    progress: {
      type: 'spend_cap',
      spent: overrides.spent ?? 200,
      cap: overrides.cap ?? 400,
      fraction: overrides.fraction ?? 0.5,
      remaining: overrides.remaining ?? 200,
      projectedMonthly: overrides.projectedMonthly ?? 380,
    },
  }) as GoalWithProgress;

describe('buildCoachingInput', () => {
  it('returns savings-hit input when fraction >= 1', () => {
    const input = buildCoachingInput(
      savingsGoal({ fraction: 1.1, current: 11000 }),
      'hit',
      null,
    );
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('hit');
    if (input?.kind === 'savings' && input.verdict === 'hit') {
      expect(input.overshoot).toBe(1000);
    }
  });

  it('returns savings-on-pace input with null topDiscretionaryCategory', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 600 }),
      'on-pace',
      null,
    );
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('on-pace');
    if (input?.kind === 'savings' && input.verdict === 'on-pace') {
      expect(input.monthlyVelocity).toBe(600);
      expect(input.topDiscretionaryCategory).toBeNull();
    }
  });

  it('returns savings-behind input with topDiscretionaryCategory when provided', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 200 }),
      'behind',
      { name: 'TRAVEL', monthlyAmount: 298 },
    );
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('behind');
    if (input?.kind === 'savings' && input.verdict === 'behind') {
      expect(input.monthlyVelocity).toBe(200);
      expect(input.topDiscretionaryCategory).not.toBeNull();
      expect(input.topDiscretionaryCategory?.name).toBe('Travel');
      expect(input.topDiscretionaryCategory?.monthlyAmount).toBe(298);
    }
  });

  it('returns savings-behind input with null category when not provided', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 200 }),
      'behind',
      null,
    );
    if (input?.kind === 'savings' && input.verdict === 'behind') {
      expect(input.topDiscretionaryCategory).toBeNull();
    }
  });

  it('returns spend_cap-on-pace input with empty topMerchants', () => {
    const input = buildCoachingInput(spendCapGoal({ fraction: 0.5 }), 'on-pace', null);
    expect(input?.kind).toBe('spend_cap');
    expect(input?.verdict).toBe('on-pace');
    if (input?.kind === 'spend_cap') {
      expect(input.topMerchants).toEqual([]);
    }
  });

  it('returns spend_cap-over input', () => {
    const input = buildCoachingInput(
      spendCapGoal({ fraction: 1.2, spent: 480, cap: 400, projectedMonthly: 480 }),
      'over',
      null,
    );
    expect(input?.kind).toBe('spend_cap');
    expect(input?.verdict).toBe('over');
    if (input?.kind === 'spend_cap' && input.verdict === 'over') {
      expect(input.spent).toBe(480);
      expect(input.cap).toBe(400);
    }
  });

  it('returns spend_cap-behind input', () => {
    const input = buildCoachingInput(
      spendCapGoal({ fraction: 0.7, projectedMonthly: 450 }),
      'behind',
      null,
    );
    expect(input?.kind).toBe('spend_cap');
    expect(input?.verdict).toBe('behind');
  });
});

describe('computeRequiredMonthlyVelocity', () => {
  it('returns 0 for spend_cap goals', () => {
    expect(computeRequiredMonthlyVelocity(spendCapGoal())).toBe(0);
  });

  it('returns remaining / 12 when no targetDate', () => {
    const goal = savingsGoal({ remaining: 6000, targetDate: null });
    expect(computeRequiredMonthlyVelocity(goal)).toBe(500);
  });

  it('returns positive value for savings with future targetDate', () => {
    // Target ~12 months out, remaining 6000 → ~500/mo
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const goal = savingsGoal({
      remaining: 6000,
      targetDate: future.toISOString().slice(0, 10),
    });
    const required = computeRequiredMonthlyVelocity(goal);
    expect(required).toBeGreaterThan(400);
    expect(required).toBeLessThan(700);
  });

  it('clamps to remaining/1 when target is past (monthsRemaining floored at 1)', () => {
    const goal = savingsGoal({
      remaining: 1000,
      targetDate: '2020-01-01', // past
    });
    expect(computeRequiredMonthlyVelocity(goal)).toBe(1000);
  });
});
