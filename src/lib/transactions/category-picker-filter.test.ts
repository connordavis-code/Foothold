import { describe, expect, it } from 'vitest';
import type { CategoryOption } from '@/lib/db/queries/categories';
import { filterCategoryPickerOptions } from './category-picker-filter';

const pfc = (name: string): CategoryOption => ({
  id: null,
  name,
  source: 'pfc',
});
const user = (name: string): CategoryOption => ({
  id: `user-${name}`,
  name,
  source: 'user',
});

describe('filterCategoryPickerOptions', () => {
  it('drops PFC "Transfer Out" — the foot-gun that wrote to category_override_id during real-data UAT 2026-05-13', () => {
    const result = filterCategoryPickerOptions([
      pfc('Transfer Out'),
      pfc('Loan Payments'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Loan Payments']);
  });

  it('drops PFC "Transfer In" — the inflow leg of the same foot-gun', () => {
    const result = filterCategoryPickerOptions([
      pfc('Transfer In'),
      pfc('Income'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Income']);
  });

  it('drops case-insensitively (defensive against humanizer drift)', () => {
    const result = filterCategoryPickerOptions([
      pfc('transfer out'),
      pfc('TRANSFER IN'),
      pfc('Loan Payments'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Loan Payments']);
  });

  it('keeps user-created categories even if they happen to be named "Transfer Out"', () => {
    // A user who manually created a category called "Transfer Out" has
    // a deliberate display use for it — don't second-guess them.
    const result = filterCategoryPickerOptions([
      user('Transfer Out'),
      pfc('Transfer Out'),
    ]);
    expect(result).toEqual([user('Transfer Out')]);
  });

  it('keeps unrelated PFC entries intact', () => {
    const result = filterCategoryPickerOptions([
      pfc('Income'),
      pfc('Food And Drink'),
      pfc('Loan Payments'),
      pfc('General Merchandise'),
      pfc('Bank Fees'),
    ]);
    expect(result).toHaveLength(5);
  });

  it('returns empty for empty input', () => {
    expect(filterCategoryPickerOptions([])).toEqual([]);
  });

  it('handles whitespace around the PFC name', () => {
    const result = filterCategoryPickerOptions([
      pfc('  Transfer Out  '),
      pfc('Loan Payments'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Loan Payments']);
  });
});
