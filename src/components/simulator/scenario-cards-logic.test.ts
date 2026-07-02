import { describe, expect, it } from 'vitest';

import type { ScenarioOverrides } from '@/lib/forecast/types';
import { describeScenarioChanges } from './scenario-cards-logic';

const EMPTY: ScenarioOverrides = {};
const WITH_LUMP: ScenarioOverrides = {
  lumpSums: [{ id: 'l1', label: 'Bonus', amount: 500, month: '2026-08' }],
};
const WITH_INCOME: ScenarioOverrides = { incomeDelta: { monthlyDelta: 250 } };

/**
 * describeScenarioChanges is the hybrid-model caption for the compare card.
 * A scenario's effect can now come from TWO disjoint stores — scenario_move
 * rows (mapped templates) and the legacy `overrides` JSON (unmapped caps) —
 * so the caption must reflect both, or it under-describes a scenario whose
 * whole effect is Moves (the common case post-R.4). See T22.
 */
describe('describeScenarioChanges', () => {
  it('reads "no changes" when both stores are empty', () => {
    expect(describeScenarioChanges(EMPTY, 0)).toBe('no changes');
  });

  it('falls back to the override description when there are no Moves', () => {
    expect(describeScenarioChanges(WITH_LUMP, 0)).toBe('1 lump sum');
  });

  it('describes Moves alone when overrides are empty', () => {
    expect(describeScenarioChanges(EMPTY, 3)).toBe('3 Moves');
  });

  it('singularizes a single Move', () => {
    expect(describeScenarioChanges(EMPTY, 1)).toBe('1 Move');
  });

  it('joins Moves and overrides when both stores carry data', () => {
    expect(describeScenarioChanges(WITH_LUMP, 3)).toBe('3 Moves · 1 lump sum');
  });

  it('joins Moves with a non-lump override', () => {
    expect(describeScenarioChanges(WITH_INCOME, 2)).toBe('2 Moves · income adj');
  });
});
