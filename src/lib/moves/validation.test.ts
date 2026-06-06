import { describe, expect, it } from 'vitest';

import {
  goalMoveInputSchema,
  goalMoveSourceSchema,
  MOVE_TEMPLATE_KEYS,
  scenarioMoveInputSchema,
} from './validation';

// Stable deterministic UUIDs for tests — readability + no cross-test bleed.
const goalId = '11111111-1111-4111-8111-111111111111';
const scenarioId = '22222222-2222-4222-8222-222222222222';
const streamId = '33333333-3333-4333-8333-333333333333';

describe('goalMoveInputSchema', () => {
  it('accepts a valid adjust-recurring move', () => {
    const parsed = goalMoveInputSchema.parse({
      templateKey: 'adjust-recurring',
      params: { streamId, startMonth: '2026-06', newAmount: 50 },
      goalId,
    });
    expect(parsed.templateKey).toBe('adjust-recurring');
    if (parsed.templateKey === 'adjust-recurring') {
      expect(parsed.params.newAmount).toBe(50);
    }
    expect(parsed.source).toBe('manual'); // default applied
  });

  it('accepts a valid reduce-category move', () => {
    const parsed = goalMoveInputSchema.parse({
      templateKey: 'reduce-category',
      params: {
        categoryKey: 'FOOD_AND_DRINK',
        startMonth: '2026-06',
        endMonth: '2026-12',
        deltaAmount: 100,
      },
      goalId,
      source: 'drift',
    });
    expect(parsed.source).toBe('drift');
  });

  it('accepts a valid income-event move with negative monthlyAmount', () => {
    // Job-loss case — negative income delta is valid.
    const parsed = goalMoveInputSchema.parse({
      templateKey: 'income-event',
      params: { startMonth: '2026-07', monthlyAmount: -4000 },
      goalId,
    });
    if (parsed.templateKey === 'income-event') {
      expect(parsed.params.monthlyAmount).toBe(-4000);
    }
  });

  it('REJECTS skip-once at the discriminator (SPEC Decision #3)', () => {
    // Committing to a single-instance skip is semantically incoherent.
    // The Zod boundary must enforce this — server actions rely on it
    // before INSERTing into goal_move.
    const result = goalMoveInputSchema.safeParse({
      templateKey: 'skip-once',
      params: { streamId, month: '2026-06' },
      goalId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative newAmount on adjust-recurring (nonnegative invariant)', () => {
    const result = goalMoveInputSchema.safeParse({
      templateKey: 'adjust-recurring',
      params: { streamId, startMonth: '2026-06', newAmount: -10 },
      goalId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero monthlyAmount on income-event (no-op commitments forbidden)', () => {
    const result = goalMoveInputSchema.safeParse({
      templateKey: 'income-event',
      params: { startMonth: '2026-07', monthlyAmount: 0 },
      goalId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed monthString (must be YYYY-MM)', () => {
    const result = goalMoveInputSchema.safeParse({
      templateKey: 'adjust-recurring',
      // '2026-6' missing zero-pad; engine wants strict YYYY-MM.
      params: { streamId, startMonth: '2026-6', newAmount: 50 },
      goalId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid goalId', () => {
    const result = goalMoveInputSchema.safeParse({
      templateKey: 'adjust-recurring',
      params: { streamId, startMonth: '2026-06', newAmount: 50 },
      goalId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('scenarioMoveInputSchema', () => {
  it('accepts skip-once (simulator-only template)', () => {
    const parsed = scenarioMoveInputSchema.parse({
      templateKey: 'skip-once',
      params: { streamId, month: '2026-06' },
      scenarioId,
    });
    expect(parsed.templateKey).toBe('skip-once');
  });

  it('accepts all four template kinds', () => {
    const variants = [
      {
        templateKey: 'adjust-recurring' as const,
        params: { streamId, startMonth: '2026-06', newAmount: 50 },
      },
      {
        templateKey: 'reduce-category' as const,
        params: {
          categoryKey: 'FOOD_AND_DRINK',
          startMonth: '2026-06',
          deltaAmount: 80,
        },
      },
      {
        templateKey: 'income-event' as const,
        params: { startMonth: '2026-07', monthlyAmount: 500 },
      },
      {
        templateKey: 'skip-once' as const,
        params: { streamId, month: '2026-06' },
      },
    ];

    for (const v of variants) {
      const parsed = scenarioMoveInputSchema.parse({ ...v, scenarioId });
      expect(parsed.templateKey).toBe(v.templateKey);
    }
  });
});

describe('goalMoveSourceSchema', () => {
  it('accepts the three documented sources', () => {
    for (const s of ['manual', 'drift', 'hike']) {
      expect(goalMoveSourceSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown source values', () => {
    expect(goalMoveSourceSchema.safeParse('llm').success).toBe(false);
  });
});

describe('MOVE_TEMPLATE_KEYS', () => {
  it('enumerates all four templates with stable ordering', () => {
    expect(MOVE_TEMPLATE_KEYS).toEqual([
      'adjust-recurring',
      'reduce-category',
      'income-event',
      'skip-once',
    ]);
  });
});
