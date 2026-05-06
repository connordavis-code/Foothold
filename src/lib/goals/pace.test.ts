import { describe, expect, it } from 'vitest';
import type {
  GoalProgress,
  GoalWithProgress,
} from '@/lib/db/queries/goals';
import { paceVerdict, severityKey } from './pace';

function makeGoal(
  type: 'savings' | 'spend_cap',
  progress: GoalProgress,
  targetDate: string | null = null,
): GoalWithProgress {
  return {
    id: 't',
    name: 'Test',
    type,
    targetAmount: type === 'savings' ? 1000 : null,
    monthlyAmount: type === 'spend_cap' ? 100 : null,
    accountIds: null,
    categoryFilter: null,
    targetDate,
    isActive: true,
    createdAt: new Date('2026-05-01'),
    scopedAccountNames: [],
    progress,
  };
}

function cap(o: Partial<Extract<GoalProgress, { type: 'spend_cap' }>> = {}) {
  return makeGoal('spend_cap', {
    type: 'spend_cap',
    spent: 0,
    cap: 100,
    fraction: 0,
    remaining: 100,
    projectedMonthly: 0,
    ...o,
  });
}

function savings(
  o: Partial<Extract<GoalProgress, { type: 'savings' }>> = {},
  targetDate: string | null = null,
) {
  return makeGoal(
    'savings',
    {
      type: 'savings',
      current: 0,
      target: 1000,
      fraction: 0,
      remaining: 1000,
      monthlyVelocity: 0,
      monthsToTarget: null,
      projectedDate: null,
      ...o,
    },
    targetDate,
  );
}

describe('paceVerdict — spend_cap', () => {
  it('returns "over" when already past the cap', () => {
    expect(
      paceVerdict(cap({ fraction: 1.2, spent: 120, projectedMonthly: 130 })),
    ).toBe('over');
  });

  it('returns "behind" when projection breaches the cap but spent is still under', () => {
    expect(
      paceVerdict(cap({ fraction: 0.6, spent: 60, projectedMonthly: 110 })),
    ).toBe('behind');
  });

  it('returns "on-pace" when both spent and projection are under the cap', () => {
    expect(
      paceVerdict(cap({ fraction: 0.4, spent: 40, projectedMonthly: 80 })),
    ).toBe('on-pace');
  });

  it('treats projection-equals-cap as on-pace, not behind', () => {
    expect(
      paceVerdict(cap({ fraction: 0.5, spent: 50, projectedMonthly: 100 })),
    ).toBe('on-pace');
  });
});

describe('paceVerdict — savings', () => {
  it('returns "hit" when fraction has reached 100%', () => {
    expect(
      paceVerdict(savings({ fraction: 1.0, current: 1000, monthlyVelocity: 50 })),
    ).toBe('hit');
  });

  it('returns "hit" when fraction is over 100% (over-funded)', () => {
    expect(
      paceVerdict(savings({ fraction: 1.5, current: 1500, monthlyVelocity: 50 })),
    ).toBe('hit');
  });

  it('returns "behind" when no contribution detected and target not yet hit', () => {
    expect(
      paceVerdict(savings({ fraction: 0.5, current: 500, monthlyVelocity: 0 })),
    ).toBe('behind');
  });

  it('returns "behind" when the account is depleting (negative velocity)', () => {
    expect(
      paceVerdict(savings({ fraction: 0.5, current: 500, monthlyVelocity: -50 })),
    ).toBe('behind');
  });

  it('returns "on-pace" when contributing with no targetDate set', () => {
    expect(
      paceVerdict(
        savings({
          fraction: 0.3,
          current: 300,
          monthlyVelocity: 50,
          monthsToTarget: 14,
          projectedDate: '2027-07-01',
        }),
      ),
    ).toBe('on-pace');
  });

  it('returns "on-pace" when projectedDate is on or before targetDate', () => {
    expect(
      paceVerdict(
        savings(
          {
            fraction: 0.3,
            current: 300,
            monthlyVelocity: 50,
            monthsToTarget: 14,
            projectedDate: '2027-06-01',
          },
          '2027-09-01',
        ),
      ),
    ).toBe('on-pace');
  });

  it('returns "behind" when projectedDate slips past targetDate', () => {
    expect(
      paceVerdict(
        savings(
          {
            fraction: 0.3,
            current: 300,
            monthlyVelocity: 20,
            monthsToTarget: 35,
            projectedDate: '2029-04-01',
          },
          '2027-09-01',
        ),
      ),
    ).toBe('behind');
  });
});

describe('severityKey — bucket ordering', () => {
  it('ranks already-over caps above projected-over caps', () => {
    const over = cap({ fraction: 1.05, spent: 105, projectedMonthly: 110 });
    const projected = cap({ fraction: 0.5, spent: 50, projectedMonthly: 200 });
    expect(severityKey(over)).toBeGreaterThan(severityKey(projected));
  });

  it('ranks projected-over caps above late-ETA savings', () => {
    const projected = cap({ fraction: 0.5, spent: 50, projectedMonthly: 110 });
    const late = savings(
      {
        fraction: 0.3,
        current: 300,
        monthlyVelocity: 20,
        monthsToTarget: 35,
        projectedDate: '2029-04-01',
      },
      '2027-09-01',
    );
    expect(severityKey(projected)).toBeGreaterThan(severityKey(late));
  });

  it('ranks late-ETA savings above dormant savings', () => {
    const late = savings(
      {
        fraction: 0.3,
        current: 300,
        monthlyVelocity: 20,
        monthsToTarget: 35,
        projectedDate: '2029-04-01',
      },
      '2027-09-01',
    );
    const dormant = savings({
      fraction: 0.5,
      current: 500,
      monthlyVelocity: 0,
    });
    expect(severityKey(late)).toBeGreaterThan(severityKey(dormant));
  });

  it('ranks any "behind" goal above any on-pace goal', () => {
    const dormant = savings({
      fraction: 0.5,
      current: 500,
      monthlyVelocity: 0,
    });
    const onPace = cap({ fraction: 0.4, spent: 40, projectedMonthly: 80 });
    expect(severityKey(dormant)).toBeGreaterThan(severityKey(onPace));
  });
});

describe('severityKey — within-bucket ordering', () => {
  it('ranks larger overages higher within over caps', () => {
    const small = cap({ fraction: 1.05, spent: 105 });
    const big = cap({ fraction: 1.5, spent: 150 });
    expect(severityKey(big)).toBeGreaterThan(severityKey(small));
  });

  it('ranks larger projected breaches higher within projected-over caps', () => {
    const small = cap({ fraction: 0.5, spent: 50, projectedMonthly: 105 });
    const big = cap({ fraction: 0.5, spent: 50, projectedMonthly: 150 });
    expect(severityKey(big)).toBeGreaterThan(severityKey(small));
  });

  it('ranks more-late savings higher within late-ETA bucket', () => {
    const aBitLate = savings(
      {
        fraction: 0.3,
        current: 300,
        monthlyVelocity: 50,
        monthsToTarget: 16,
        projectedDate: '2027-10-01',
      },
      '2027-09-01',
    );
    const veryLate = savings(
      {
        fraction: 0.3,
        current: 300,
        monthlyVelocity: 10,
        monthsToTarget: 70,
        projectedDate: '2032-01-01',
      },
      '2027-09-01',
    );
    expect(severityKey(veryLate)).toBeGreaterThan(severityKey(aBitLate));
  });
});

describe('severityKey — defensive', () => {
  it('does not produce NaN or Infinity for a zero cap', () => {
    const k = severityKey(cap({ fraction: 1.0, spent: 0, cap: 0, projectedMonthly: 0 }));
    expect(Number.isFinite(k)).toBe(true);
  });

  it('returns a finite value for hit goals', () => {
    const k = severityKey(savings({ fraction: 1.0, current: 1000 }));
    expect(Number.isFinite(k)).toBe(true);
  });
});
