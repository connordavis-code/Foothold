import { describe, expect, it } from 'vitest';
import type { GoalMove, ScenarioMove } from '@/lib/db/schema';
import { findDuplicateMove, findDuplicateScenarioMove } from './moves';

const row = (overrides: Partial<GoalMove>): GoalMove => ({
  id: 'm-1',
  userId: 'u-1',
  goalId: 'g-1',
  templateKey: 'adjust-recurring',
  params: {},
  source: 'manual',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const srow = (overrides: Partial<ScenarioMove>): ScenarioMove => ({
  id: 'sm-1',
  userId: 'u-1',
  scenarioId: 's-1',
  templateKey: 'adjust-recurring',
  params: {},
  createdAt: new Date(0),
  ...overrides,
});

describe('findDuplicateMove', () => {
  it('returns null when existing array is empty', () => {
    const input = { goalId: 'g-1', templateKey: 'adjust-recurring', params: {} };
    const result = findDuplicateMove(input, []);
    expect(result).toBeNull();
  });

  it('finds duplicate with flat params identical in order', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { amount: 100, recurrenceId: 'r-1' },
      }),
    ];
    const input = {
      goalId: 'g-1',
      templateKey: 'adjust-recurring',
      params: { amount: 100, recurrenceId: 'r-1' },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toEqual(existing[0]);
  });

  it('finds duplicate with flat params in different insertion order', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { amount: 100, recurrenceId: 'r-1' },
      }),
    ];
    const input = {
      goalId: 'g-1',
      templateKey: 'adjust-recurring',
      params: { recurrenceId: 'r-1', amount: 100 },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toEqual(existing[0]);
  });

  it('finds duplicate with nested params in different inner key order', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { outer: { z: 1, y: 2 } },
      }),
    ];
    const input = {
      goalId: 'g-1',
      templateKey: 'adjust-recurring',
      params: { outer: { y: 2, z: 1 } },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toEqual(existing[0]);
  });

  it('returns null when array params are in different order', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { items: [1, 2] },
      }),
    ];
    const input = {
      goalId: 'g-1',
      templateKey: 'adjust-recurring',
      params: { items: [2, 1] },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toBeNull();
  });

  it('returns null when templateKey differs', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { amount: 100 },
      }),
    ];
    const input = {
      goalId: 'g-1',
      templateKey: 'adjust-different',
      params: { amount: 100 },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toBeNull();
  });

  it('returns null when goalId differs', () => {
    const existing = [
      row({
        goalId: 'g-1',
        templateKey: 'adjust-recurring',
        params: { amount: 100 },
      }),
    ];
    const input = {
      goalId: 'g-2',
      templateKey: 'adjust-recurring',
      params: { amount: 100 },
    };
    const result = findDuplicateMove(input, existing);
    expect(result).toBeNull();
  });
});

describe('findDuplicateScenarioMove', () => {
  it('returns null when existing array is empty', () => {
    const input = { scenarioId: 's-1', templateKey: 'reduce-category', params: {} };
    expect(findDuplicateScenarioMove(input, [])).toBeNull();
  });

  it('finds duplicate with flat params identical in order', () => {
    const existing = [
      srow({
        scenarioId: 's-1',
        templateKey: 'reduce-category',
        params: { categoryKey: 'cat-a', deltaAmount: 50 },
      }),
    ];
    const input = {
      scenarioId: 's-1',
      templateKey: 'reduce-category',
      params: { categoryKey: 'cat-a', deltaAmount: 50 },
    };
    expect(findDuplicateScenarioMove(input, existing)).toEqual(existing[0]);
  });

  it('finds duplicate with params in different insertion order (shared stableStringify)', () => {
    const existing = [
      srow({
        scenarioId: 's-1',
        templateKey: 'reduce-category',
        params: { categoryKey: 'cat-a', deltaAmount: 50, startMonth: '2026-07' },
      }),
    ];
    const input = {
      scenarioId: 's-1',
      templateKey: 'reduce-category',
      params: { startMonth: '2026-07', deltaAmount: 50, categoryKey: 'cat-a' },
    };
    expect(findDuplicateScenarioMove(input, existing)).toEqual(existing[0]);
  });

  it('returns null when templateKey differs', () => {
    const existing = [
      srow({
        scenarioId: 's-1',
        templateKey: 'skip-once',
        params: { streamId: 'r-1', month: '2026-08' },
      }),
    ];
    const input = {
      scenarioId: 's-1',
      templateKey: 'reduce-category',
      params: { streamId: 'r-1', month: '2026-08' },
    };
    expect(findDuplicateScenarioMove(input, existing)).toBeNull();
  });

  it('returns null when scenarioId differs', () => {
    const existing = [
      srow({
        scenarioId: 's-1',
        templateKey: 'skip-once',
        params: { streamId: 'r-1', month: '2026-08' },
      }),
    ];
    const input = {
      scenarioId: 's-2',
      templateKey: 'skip-once',
      params: { streamId: 'r-1', month: '2026-08' },
    };
    expect(findDuplicateScenarioMove(input, existing)).toBeNull();
  });

  it('isolates per-scenario: matching params in a different scenario are not duplicates', () => {
    // Same templateKey + same params, but different scenarioId — distinct rows.
    // Mirrors the goal-side per-goal isolation rule.
    const existing = [
      srow({
        id: 'sm-other',
        scenarioId: 's-other',
        templateKey: 'income-event',
        params: { monthlyAmount: 500, startMonth: '2026-07' },
      }),
    ];
    const input = {
      scenarioId: 's-1',
      templateKey: 'income-event',
      params: { monthlyAmount: 500, startMonth: '2026-07' },
    };
    expect(findDuplicateScenarioMove(input, existing)).toBeNull();
  });
});
