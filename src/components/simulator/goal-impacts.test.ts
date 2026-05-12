import { describe, it, expect } from 'vitest';
import { formatGoalImpact, sortGoalImpacts } from './goal-impacts-logic';
import type { GoalImpact } from '@/lib/forecast/types';

const sample = (overrides: Partial<GoalImpact> = {}): GoalImpact => ({
  goalId: 'g1',
  name: 'Emergency Fund',
  baselineETA: '2027-09',
  scenarioETA: '2027-02',
  shiftMonths: -7,
  ...overrides,
});

describe('formatGoalImpact', () => {
  it('formats faster outcome', () => {
    expect(formatGoalImpact(sample())).toEqual({
      statusKey: 'faster',
      arrivalLabel: '2027 · 02',
      baselineLabel: '2027-09',
      deltaLabel: '− 7 months',
    });
  });

  it('formats slower outcome', () => {
    expect(formatGoalImpact(sample({ scenarioETA: '2027-11', shiftMonths: 2 }))).toEqual({
      statusKey: 'slower',
      arrivalLabel: '2027 · 11',
      baselineLabel: '2027-09',
      deltaLabel: '+ 2 months',
    });
  });

  it('formats same outcome', () => {
    expect(formatGoalImpact(sample({ scenarioETA: '2027-09', shiftMonths: 0 }))).toEqual({
      statusKey: 'same',
      arrivalLabel: '2027 · 09',
      baselineLabel: '2027-09',
      deltaLabel: 'same as baseline',
    });
  });

  it('handles null scenarioETA', () => {
    expect(formatGoalImpact(sample({ scenarioETA: null, shiftMonths: 0 }))).toMatchObject({
      statusKey: 'same',
      arrivalLabel: 'never',
    });
  });

  it('handles null baselineETA', () => {
    expect(formatGoalImpact(sample({ baselineETA: null, shiftMonths: -3 }))).toMatchObject({
      baselineLabel: 'never',
    });
  });
});

describe('sortGoalImpacts', () => {
  it('orders by abs(shiftMonths) descending, then name', () => {
    const impacts: GoalImpact[] = [
      sample({ goalId: 'a', name: 'A', shiftMonths: -1 }),
      sample({ goalId: 'b', name: 'B', shiftMonths: -7 }),
      sample({ goalId: 'c', name: 'C', shiftMonths: 0 }),
    ];
    const sorted = sortGoalImpacts(impacts);
    expect(sorted.map((i) => i.goalId)).toEqual(['b', 'a', 'c']);
  });

  it('sorts ties by name ascending', () => {
    const impacts: GoalImpact[] = [
      sample({ goalId: 'z', name: 'Zebra', shiftMonths: 0 }),
      sample({ goalId: 'a', name: 'Apple', shiftMonths: 0 }),
    ];
    const sorted = sortGoalImpacts(impacts);
    expect(sorted.map((i) => i.goalId)).toEqual(['a', 'z']);
  });
});
