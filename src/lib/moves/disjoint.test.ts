import { describe, expect, it } from 'vitest';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import type { ScenarioMoveInput } from './validation';
import { checkDisjointWithOverrides, DisjointViolationError } from './disjoint';

const SCENARIO_ID = '11111111-1111-1111-1111-111111111111';
const STREAM_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_STREAM = '33333333-3333-3333-3333-333333333333';

// =============================================================================
// Empty-overrides cases — every kind must return ok
// =============================================================================

describe('checkDisjointWithOverrides — empty/missing overrides', () => {
  const empty: ScenarioOverrides = {};

  it('returns ok when overrides is null', () => {
    const input: ScenarioMoveInput = {
      templateKey: 'reduce-category',
      scenarioId: SCENARIO_ID,
      params: { categoryKey: 'cat-a', startMonth: '2026-07', deltaAmount: 50 },
    };
    expect(checkDisjointWithOverrides(input, null)).toEqual({ ok: true });
  });

  it('returns ok when overrides is undefined', () => {
    const input: ScenarioMoveInput = {
      templateKey: 'income-event',
      scenarioId: SCENARIO_ID,
      params: { startMonth: '2026-07', monthlyAmount: 1000 },
    };
    expect(checkDisjointWithOverrides(input, undefined)).toEqual({ ok: true });
  });

  it('returns ok when overrides is the empty object', () => {
    const input: ScenarioMoveInput = {
      templateKey: 'skip-once',
      scenarioId: SCENARIO_ID,
      params: { streamId: STREAM_ID, month: '2026-08' },
    };
    expect(checkDisjointWithOverrides(input, empty)).toEqual({ ok: true });
  });
});

// =============================================================================
// reduce-category — match on categoryId only, any sign
// =============================================================================

describe('checkDisjointWithOverrides — reduce-category', () => {
  const input: ScenarioMoveInput = {
    templateKey: 'reduce-category',
    scenarioId: SCENARIO_ID,
    params: { categoryKey: 'cat-a', startMonth: '2026-07', deltaAmount: 50 },
  };

  it('blocks when overrides has a negative-delta entry for same categoryId', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [{ categoryId: 'cat-a', monthlyDelta: -100 }],
    };
    const result = checkDisjointWithOverrides(input, overrides);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.conflict).toMatch(/cat-a/);
    expect(result.ok === false && result.conflict).toMatch(/reduce-category/);
  });

  it('blocks when overrides has a POSITIVE-delta entry for same categoryId', () => {
    // Strict rule per RESUME.md: ANY same-target match in overrides blocks.
    // Positive deltas (category increases) are legacy-defensive carriers per
    // Q1 — but they STILL render through apply-overrides, so dual-presence
    // would double-apply even with sign disagreement.
    const overrides: ScenarioOverrides = {
      categoryDeltas: [{ categoryId: 'cat-a', monthlyDelta: 75 }],
    };
    const result = checkDisjointWithOverrides(input, overrides);
    expect(result.ok).toBe(false);
  });

  it('passes when overrides has categoryDeltas for a different categoryId', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [{ categoryId: 'cat-b', monthlyDelta: -100 }],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides has an empty categoryDeltas array', () => {
    const overrides: ScenarioOverrides = { categoryDeltas: [] };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides carries unrelated capabilities (lump sums)', () => {
    const overrides: ScenarioOverrides = {
      lumpSums: [{ id: 'l1', label: 'Bonus', amount: 5000, month: '2026-09' }],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });
});

// =============================================================================
// adjust-recurring — match on streamId, only action ∈ {pause, edit}
// =============================================================================

describe('checkDisjointWithOverrides — adjust-recurring', () => {
  const input: ScenarioMoveInput = {
    templateKey: 'adjust-recurring',
    scenarioId: SCENARIO_ID,
    params: { streamId: STREAM_ID, startMonth: '2026-07', newAmount: 0 },
  };

  it('blocks when overrides has action=pause for same streamId', () => {
    const overrides: ScenarioOverrides = {
      recurringChanges: [{ streamId: STREAM_ID, action: 'pause' }],
    };
    const result = checkDisjointWithOverrides(input, overrides);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.conflict).toMatch(/adjust-recurring/);
  });

  it('blocks when overrides has action=edit for same streamId', () => {
    const overrides: ScenarioOverrides = {
      recurringChanges: [
        { streamId: STREAM_ID, action: 'edit', amount: 50 },
      ],
    };
    expect(checkDisjointWithOverrides(input, overrides).ok).toBe(false);
  });

  it('passes when overrides has action=add (hypothetical, no streamId collision possible)', () => {
    // action='add' rows are hypothetical new streams. Per ScenarioOverrides
    // shape, streamId is undefined for adds — they cannot collide with an
    // existing-stream adjust-recurring. The kept-list (T25) keeps add-path.
    const overrides: ScenarioOverrides = {
      recurringChanges: [
        { action: 'add', label: 'New gym', amount: 40, direction: 'outflow' },
      ],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides has a pause/edit for a DIFFERENT streamId', () => {
    const overrides: ScenarioOverrides = {
      recurringChanges: [{ streamId: OTHER_STREAM, action: 'pause' }],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides has an empty recurringChanges array', () => {
    const overrides: ScenarioOverrides = { recurringChanges: [] };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });
});

// =============================================================================
// skip-once — match on (streamId, month) tuple
// =============================================================================

describe('checkDisjointWithOverrides — skip-once', () => {
  const input: ScenarioMoveInput = {
    templateKey: 'skip-once',
    scenarioId: SCENARIO_ID,
    params: { streamId: STREAM_ID, month: '2026-08' },
  };

  it('blocks when overrides has matching (streamId, skipMonth)', () => {
    const overrides: ScenarioOverrides = {
      skipRecurringInstances: [{ streamId: STREAM_ID, skipMonth: '2026-08' }],
    };
    const result = checkDisjointWithOverrides(input, overrides);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.conflict).toMatch(/2026-08/);
  });

  it('passes when overrides skips same stream in a DIFFERENT month', () => {
    const overrides: ScenarioOverrides = {
      skipRecurringInstances: [{ streamId: STREAM_ID, skipMonth: '2026-09' }],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides skips a different stream in the same month', () => {
    const overrides: ScenarioOverrides = {
      skipRecurringInstances: [{ streamId: OTHER_STREAM, skipMonth: '2026-08' }],
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides has empty skipRecurringInstances', () => {
    const overrides: ScenarioOverrides = { skipRecurringInstances: [] };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });
});

// =============================================================================
// income-event — match on ANY non-zero incomeDelta
// =============================================================================

describe('checkDisjointWithOverrides — income-event', () => {
  const input: ScenarioMoveInput = {
    templateKey: 'income-event',
    scenarioId: SCENARIO_ID,
    params: { startMonth: '2026-07', monthlyAmount: 500 },
  };

  it('blocks when overrides has a non-zero positive incomeDelta', () => {
    const overrides: ScenarioOverrides = {
      incomeDelta: { monthlyDelta: 200 },
    };
    expect(checkDisjointWithOverrides(input, overrides).ok).toBe(false);
  });

  it('blocks when overrides has a non-zero negative incomeDelta (pay cut)', () => {
    const overrides: ScenarioOverrides = {
      incomeDelta: { monthlyDelta: -300 },
    };
    expect(checkDisjointWithOverrides(input, overrides).ok).toBe(false);
  });

  it('passes when overrides.incomeDelta is undefined', () => {
    const overrides: ScenarioOverrides = {};
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });

  it('passes when overrides.incomeDelta is a zero no-op', () => {
    // Zero-magnitude incomeDelta has no engine effect — treating it as a
    // conflict would block legitimate scenario_move writes for no benefit.
    const overrides: ScenarioOverrides = {
      incomeDelta: { monthlyDelta: 0 },
    };
    expect(checkDisjointWithOverrides(input, overrides)).toEqual({ ok: true });
  });
});

// =============================================================================
// DisjointViolationError sentinel
// =============================================================================

describe('DisjointViolationError', () => {
  it('preserves the conflict string in both .message and .conflict', () => {
    const e = new DisjointViolationError('cat-a already in overrides');
    expect(e.conflict).toBe('cat-a already in overrides');
    expect(e.message).toMatch(/Disjoint stores invariant violated/);
    expect(e.message).toMatch(/cat-a already in overrides/);
    expect(e.name).toBe('DisjointViolationError');
    expect(e).toBeInstanceOf(Error);
  });
});
