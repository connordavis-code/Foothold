import { describe, expect, it } from 'vitest';
import type { GoalMove } from '@/lib/db/schema';
import { findDuplicateMove } from './moves';

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
