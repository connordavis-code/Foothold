import { describe, expect, it } from 'vitest';
import { groupTransactionsByDate } from './group-by-date';
import type { TransactionListRow } from '@/lib/db/queries/transactions';

/**
 * Helper to construct a minimal TransactionListRow for tests. Only the
 * fields that group-by-date.ts touches are required; the rest are
 * stubbed with safe defaults so the type-checker is happy.
 */
function tx(overrides: Partial<TransactionListRow>): TransactionListRow {
  return {
    id: 'stub',
    name: 'Stub Tx',
    merchantName: null,
    date: '2026-05-11',
    amount: 10,
    primaryCategory: null,
    detailedCategory: null,
    pending: false,
    paymentChannel: null,
    accountId: 'acct-stub',
    accountName: 'Stub Acct',
    accountMask: '0000',
    accountType: 'depository',
    overrideCategoryId: null,
    overrideCategoryName: null,
    ...overrides,
  };
}

describe('groupTransactionsByDate', () => {
  it('returns empty array for empty input', () => {
    expect(groupTransactionsByDate([])).toEqual([]);
  });

  it('returns one group for a single row', () => {
    const rows = [tx({ id: 'a', date: '2026-05-11', amount: 10 })];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].dateIso).toBe('2026-05-11');
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a']);
  });

  it('groups same-day rows together preserving input order', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 10 }),
      tx({ id: 'b', date: '2026-05-11', amount: 20 }),
      tx({ id: 'c', date: '2026-05-11', amount: 30 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('produces groups in date-desc order', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-10' }),
      tx({ id: 'b', date: '2026-05-11' }),
      tx({ id: 'c', date: '2026-05-09' }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups.map((g) => g.dateIso)).toEqual([
      '2026-05-11',
      '2026-05-10',
      '2026-05-09',
    ]);
  });

  it('sums dayNet signed across the group (Plaid sign: +out, -in)', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 50 }),
      tx({ id: 'b', date: '2026-05-11', amount: 30 }),
      tx({ id: 'c', date: '2026-05-11', amount: -10 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayNet).toBeCloseTo(70, 2);
  });

  it('handles negative dayNet for income-heavy days', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: -5000 }),
      tx({ id: 'b', date: '2026-05-11', amount: 100 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayNet).toBeCloseTo(-4900, 2);
  });

  it('emits dayName as Sun/Mon/.../Sat via UTC parsing', () => {
    // 2026-05-11 is a Monday (verified: 2026-05-10 is Sunday).
    const rows = [tx({ id: 'a', date: '2026-05-11' })];
    const groups = groupTransactionsByDate(rows);
    expect(groups[0].dayName).toBe('Mon');
  });

  it('parses date as UTC to avoid local-timezone drift', () => {
    // A 2026-05-11 ISO date parsed with `new Date(s)` could shift to
    // 2026-05-10 in negative-offset zones. Force-UTC parsing must
    // anchor the dayName on the calendar date, not the local clock.
    const rows = [tx({ id: 'a', date: '2026-01-01' })];
    const groups = groupTransactionsByDate(rows);
    // 2026-01-01 is a Thursday in UTC.
    expect(groups[0].dayName).toBe('Thu');
  });

  it('handles multiple days with mixed signs', () => {
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 100 }),
      tx({ id: 'b', date: '2026-05-10', amount: -200 }),
      tx({ id: 'c', date: '2026-05-10', amount: 50 }),
      tx({ id: 'd', date: '2026-05-09', amount: 25 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(groups).toHaveLength(3);
    expect(groups[0].dateIso).toBe('2026-05-11');
    expect(groups[0].dayNet).toBeCloseTo(100, 2);
    expect(groups[1].dateIso).toBe('2026-05-10');
    expect(groups[1].dayNet).toBeCloseTo(-150, 2);
    expect(groups[2].dateIso).toBe('2026-05-09');
    expect(groups[2].dayNet).toBeCloseTo(25, 2);
  });

  it('preserves input order even when input is unsorted', () => {
    // `getTransactions` ALWAYS returns date-desc, but we don't enforce
    // that as a precondition — same-day rows keep their input order so
    // any caller sort within a day flows through deterministically.
    const rows = [
      tx({ id: 'a', date: '2026-05-11', amount: 30 }),
      tx({ id: 'b', date: '2026-05-10', amount: 10 }),
      tx({ id: 'c', date: '2026-05-11', amount: 20 }),
    ];
    const groups = groupTransactionsByDate(rows);
    expect(
      groups.find((g) => g.dateIso === '2026-05-11')!.rows.map((r) => r.id),
    ).toEqual(['a', 'c']);
  });
});
