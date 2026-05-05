import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GoalProgress } from '@/lib/db/queries/goals';
import { paceForGoal, paceLabel } from './pace';

function savings(progress: Partial<Extract<GoalProgress, { type: 'savings' }>> = {}) {
  return {
    type: 'savings' as const,
    fraction: 0,
    current: 0,
    target: 1000,
    remaining: 1000,
    monthlyVelocity: 0,
    monthsToTarget: null,
    projectedDate: null,
    ...progress,
  };
}

function spendCap(progress: Partial<Extract<GoalProgress, { type: 'spend_cap' }>> = {}) {
  return {
    type: 'spend_cap' as const,
    spent: 0,
    cap: 100,
    fraction: 0,
    remaining: 100,
    projectedMonthly: 0,
    ...progress,
  };
}

describe('paceForGoal — savings', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns 1 when already at target (regardless of velocity)', () => {
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: null,
        progress: savings({ fraction: 1, monthlyVelocity: -10 }) as GoalProgress,
      }),
    ).toBe(1);
  });

  // Regression for Emergency Fund bug: depleting velocity (monthsToTarget == null)
  // and no target date must NOT be reported as on pace.
  it('returns 0 when velocity ≤ 0 and not yet at target, even without a targetDate', () => {
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: null,
        progress: savings({
          fraction: 0.021,
          monthlyVelocity: -20.78,
          monthsToTarget: null,
        }) as GoalProgress,
      }),
    ).toBe(0);
  });

  it('returns 0 when velocity ≤ 0 and not at target, with a targetDate', () => {
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: '2027-05-05',
        progress: savings({
          fraction: 0.5,
          monthlyVelocity: -10,
          monthsToTarget: null,
        }) as GoalProgress,
      }),
    ).toBe(0);
  });

  it('returns 1 when positive velocity and no targetDate', () => {
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: null,
        progress: savings({
          fraction: 0.3,
          monthlyVelocity: 50,
          monthsToTarget: 14,
        }) as GoalProgress,
      }),
    ).toBe(1);
  });

  it('returns 0 when positive velocity but targetDate has passed and not yet hit', () => {
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: '2026-04-05', // a month ago
        progress: savings({
          fraction: 0.5,
          monthlyVelocity: 50,
          monthsToTarget: 10,
        }) as GoalProgress,
      }),
    ).toBe(0);
  });

  it('returns >1 when positive velocity will hit target before targetDate (ahead)', () => {
    // 12 months remaining, 6 months to target ⇒ pace = 2 (ahead)
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: '2027-05-05',
        progress: savings({
          fraction: 0.5,
          monthlyVelocity: 50,
          monthsToTarget: 6,
        }) as GoalProgress,
      }),
    ).toBeGreaterThan(1);
  });

  it('returns <1 when positive velocity will miss targetDate (behind)', () => {
    // 6 months remaining, 12 months to target ⇒ pace ≈ 0.5 (behind)
    expect(
      paceForGoal({
        type: 'savings',
        targetDate: '2026-11-05',
        progress: savings({
          fraction: 0.5,
          monthlyVelocity: 50,
          monthsToTarget: 12,
        }) as GoalProgress,
      }),
    ).toBeLessThan(1);
  });
});

describe('paceForGoal — spend_cap', () => {
  it('returns 1 when in cap', () => {
    expect(
      paceForGoal({
        type: 'spend_cap',
        targetDate: null,
        progress: spendCap({ spent: 50, cap: 100 }) as GoalProgress,
      }),
    ).toBe(1);
  });

  it('returns 0 when over cap', () => {
    expect(
      paceForGoal({
        type: 'spend_cap',
        targetDate: null,
        progress: spendCap({ spent: 200, cap: 100 }) as GoalProgress,
      }),
    ).toBe(0);
  });

  it('returns 0 when cap is 0', () => {
    expect(
      paceForGoal({
        type: 'spend_cap',
        targetDate: null,
        progress: spendCap({ spent: 0, cap: 0 }) as GoalProgress,
      }),
    ).toBe(0);
  });
});

describe('paceLabel', () => {
  it('returns "on pace" for pace >= 1', () => {
    expect(paceLabel(1)).toBe('on pace');
    expect(paceLabel(2.5)).toBe('on pace');
  });

  it('returns "behind" for pace < 1', () => {
    expect(paceLabel(0)).toBe('behind');
    expect(paceLabel(0.5)).toBe('behind');
    expect(paceLabel(0.999)).toBe('behind');
  });
});
