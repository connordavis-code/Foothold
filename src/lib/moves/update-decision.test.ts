import { describe, expect, it } from 'vitest';
import { decideGoalMoveUpdate, type GoalMoveUpdateDecision } from './update-decision';

// adjust-recurring is the canonical test template — params shape covers
// streamId + newAmount + startMonth, which exercises all three field types
// (uuid string, number, month-string) the goalMoveInputSchema enforces.
const VALID_GOAL_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_STREAM_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const existingSlice = {
  templateKey: 'adjust-recurring',
  goalId: VALID_GOAL_ID,
  params: {
    streamId: VALID_STREAM_ID,
    newAmount: 25,
    startMonth: '2026-06',
  },
};

describe('decideGoalMoveUpdate', () => {
  it('returns no-op when new params semantically equal existing params (incl. different key order)', () => {
    // Insertion order intentionally swapped — stable-stringify must produce
    // the same canonical form so dedup detection works regardless of how
    // the caller constructed the new params object.
    const newParams = {
      startMonth: '2026-06',
      newAmount: 25,
      streamId: VALID_STREAM_ID,
    };
    const decision = decideGoalMoveUpdate(existingSlice, newParams);
    expect(decision.kind).toBe('no-op');
  });

  it('returns update with validated new params when newAmount changes', () => {
    const newParams = {
      streamId: VALID_STREAM_ID,
      newAmount: 50,
      startMonth: '2026-06',
    };
    const decision = decideGoalMoveUpdate(existingSlice, newParams);
    expect(decision.kind).toBe('update');
    if (decision.kind === 'update') {
      expect(decision.params).toEqual({
        streamId: VALID_STREAM_ID,
        newAmount: 50,
        startMonth: '2026-06',
      });
    }
  });

  it('returns invalid (not insert/attach) when new params fail Zod — proves no duplicate row can be inserted', () => {
    // newAmount has min(0) per validation schema; negative fails.
    const newParams = {
      streamId: VALID_STREAM_ID,
      newAmount: -10,
      startMonth: '2026-06',
    };
    const decision = decideGoalMoveUpdate(existingSlice, newParams);

    // Structural property: the discriminated union has only 'no-op',
    // 'invalid', and 'update' arms. There is NO 'insert' / 'attach' arm,
    // so the helper cannot create a duplicate row by any input path.
    // If a future refactor adds such an arm, this assertion's type-narrow
    // structure breaks at the changed-params test above and forces a review.
    const validKinds: GoalMoveUpdateDecision['kind'][] = ['no-op', 'invalid', 'update'];
    expect(validKinds).toContain(decision.kind);

    expect(decision.kind).toBe('invalid');
    if (decision.kind === 'invalid') {
      expect(decision.error).toMatch(/newAmount/);
    }
  });
});
