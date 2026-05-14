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

  it('drops user-source "Transfer In" — real-data UAT 2026-05-14 case', () => {
    // Earlier pre-fix clicks routed through findOrCreateCategoryByName
    // which inserted user-owned rows named "Transfer Out" / "Transfer In"
    // into the categories table. Those rows persist after the fix
    // ships and would re-create the look-alike-path foot-gun if they
    // remained selectable in the write picker. Source-agnostic filter
    // closes that hole.
    const result = filterCategoryPickerOptions([
      user('Transfer In'),
      user('Loan Payments'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Loan Payments']);
  });

  it('drops both user-source AND pfc-source entries with transfer-classification names', () => {
    // Defensive: any duplicate-source scenario should be cleaned up
    // by the same rule. The dedicated "Mark as transfer" affordance is
    // the single source of truth for that semantic — no picker entry
    // with those names is legitimate.
    const result = filterCategoryPickerOptions([
      user('Transfer Out'),
      pfc('Transfer Out'),
      user('Transfer In'),
      pfc('Transfer In'),
      user('Groceries'),
    ]);
    expect(result.map((o) => o.name)).toEqual(['Groceries']);
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
