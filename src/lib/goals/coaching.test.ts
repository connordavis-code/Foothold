// src/lib/goals/coaching.test.ts
import { describe, expect, it } from 'vitest';
import { composeCoaching } from './coaching';

describe('composeCoaching — savings', () => {
  it('returns ahead-of-pace status with no action sentence when on-pace', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'on-pace',
      monthlyVelocity: 250,
      requiredMonthlyVelocity: 200,
      topDiscretionaryCategory: null,
    });
    expect(out.status).toBe("You're $50/mo ahead of pace.");
    expect(out.action).toBeNull();
  });

  it('returns behind status + action sentence pulling top category', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: 100,
      requiredMonthlyVelocity: 313,
      topDiscretionaryCategory: { name: 'Dining', monthlyAmount: 620 },
    });
    expect(out.status).toBe("You're $213/mo behind pace.");
    expect(out.action).toBe(
      'Trim Dining (your largest discretionary at $620/mo) by $213 to recover.',
    );
  });

  it('omits action sentence when behind but no category data exists', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'behind',
      monthlyVelocity: 100,
      requiredMonthlyVelocity: 313,
      topDiscretionaryCategory: null,
    });
    expect(out.status).toBe("You're $213/mo behind pace.");
    expect(out.action).toBeNull();
  });

  it('returns hit confirmation with no action', () => {
    const out = composeCoaching({
      kind: 'savings',
      verdict: 'hit',
      hitDate: '2026-04-15',
      overshoot: 200,
    });
    expect(out.status).toBe('You hit this goal Apr 15 — $200 ahead of target.');
    expect(out.action).toBeNull();
  });
});

describe('composeCoaching — spend_cap', () => {
  it('returns under-the-cap confirmation with no action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'on-pace',
      cap: 700,
      spent: 200,
      projectedMonthly: 600,
      topMerchants: [],
    });
    expect(out.status).toBe('Tracking $100 under the cap.');
    expect(out.action).toBeNull();
  });

  it('returns projected-over status + top-3 merchants action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'behind',
      cap: 700,
      spent: 400,
      projectedMonthly: 887,
      topMerchants: [
        { name: 'Starbucks', amount: 87 },
        { name: 'Sweetgreen', amount: 64 },
        { name: 'DoorDash', amount: 52 },
      ],
    });
    expect(out.status).toBe('Projected to overspend by $187 at this pace.');
    expect(out.action).toBe(
      'Skipping any one of Starbucks ($87), Sweetgreen ($64), DoorDash ($52) resets your pace.',
    );
  });

  it('returns already-over status + merchants action', () => {
    const out = composeCoaching({
      kind: 'spend_cap',
      verdict: 'over',
      cap: 700,
      spent: 787,
      projectedMonthly: 950,
      topMerchants: [
        { name: 'Sweetgreen', amount: 110 },
        { name: 'Uber Eats', amount: 78 },
      ],
    });
    expect(out.status).toBe('Already $87 over the cap.');
    expect(out.action).toBe(
      'Skipping any one of Sweetgreen ($110), Uber Eats ($78) resets your pace.',
    );
  });
});
