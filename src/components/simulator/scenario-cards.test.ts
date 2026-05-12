import { describe, it, expect } from 'vitest';
import { pickActiveCard } from './scenario-cards-logic';
import type { ScenarioOverrides } from '@/lib/forecast/types';

const empty: ScenarioOverrides = {};
const some: ScenarioOverrides = { lumpSums: [{ id: 'a', label: 'x', amount: -100, month: '2026-09' }] };

const scenarios = [
  { id: 's1', name: 'Trim recurring' },
  { id: 's2', name: 'Big buy' },
];

describe('pickActiveCard', () => {
  it("returns 'baseline' when no scenario selected AND no overrides", () => {
    expect(pickActiveCard(scenarios as never, null, empty)).toBe('baseline');
  });

  it('returns the selected scenario id when set', () => {
    expect(pickActiveCard(scenarios as never, 's1', empty)).toBe('s1');
  });

  it("returns 'unsaved' when overrides exist but no scenario selected", () => {
    expect(pickActiveCard(scenarios as never, null, some)).toBe('unsaved');
  });

  it("returns the selected scenario id even when overrides differ (dirty)", () => {
    expect(pickActiveCard(scenarios as never, 's1', some)).toBe('s1');
  });
});
