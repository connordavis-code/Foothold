import { describe, expect, it } from 'vitest';
import {
  groupByDateWindow,
  pickNextCharge,
  trendIndicator,
} from './calendar-windows';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

/**
 * Helper to construct a minimal RecurringStreamRow for tests. Only the
 * fields that calendar-windows.ts touches are required; the rest are
 * stubbed with safe defaults so the type-checker is happy.
 */
function stream(overrides: Partial<RecurringStreamRow>): RecurringStreamRow {
  return {
    id: 'stub',
    plaidStreamId: null,
    direction: 'outflow',
    isActive: true,
    status: 'MATURE',
    merchantName: 'Stub Merchant',
    description: null,
    primaryCategory: null,
    detailedCategory: null,
    averageAmount: 10,
    lastAmount: 10,
    frequency: 'MONTHLY',
    firstDate: '2026-01-01',
    lastDate: '2026-04-01',
    predictedNextDate: null,
    accountId: 'acct-stub',
    accountName: 'Stub Acct',
    accountMask: '0000',
    ...overrides,
  } as RecurringStreamRow;
}

// ---------- groupByDateWindow ----------

describe('groupByDateWindow', () => {
  // 2026-05-10 is a Sunday. End-of-this-week (Sunday) is 2026-05-10
  // itself. Monday-of-next-week is 2026-05-11. Last day of May is
  // 2026-05-31. June is the next month.
  const TODAY = new Date('2026-05-10T00:00:00Z');

  it('returns empty buckets for empty input', () => {
    expect(groupByDateWindow([], TODAY)).toEqual({
      thisWeek: [],
      laterThisMonth: [],
      nextMonth: [],
      beyond: [],
    });
  });

  it('buckets a stream dated today into thisWeek', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-05-10' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.laterThisMonth).toEqual([]);
  });

  it('buckets a stream dated end-of-this-week (Sunday) into thisWeek', () => {
    // TODAY is Sunday so end-of-this-week IS today. Use a Wed test
    // with a Sun-end-of-week target date to exercise this case.
    const wednesday = new Date('2026-05-13T00:00:00Z'); // Wednesday
    const s = stream({ id: 'a', predictedNextDate: '2026-05-17' }); // Sunday
    const result = groupByDateWindow([s], wednesday);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets next-Monday stream into laterThisMonth', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const s = stream({ id: 'a', predictedNextDate: '2026-05-18' }); // Monday
    const result = groupByDateWindow([s], wednesday);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets last-day-of-month stream into laterThisMonth', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const s = stream({ id: 'a', predictedNextDate: '2026-05-31' });
    const result = groupByDateWindow([s], wednesday);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets first-day-of-next-month stream into nextMonth', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-06-01' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets last-day-of-next-month stream into nextMonth', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-06-30' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['a']);
  });

  it('buckets a 90-day-out annual fee into beyond', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-08-15' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.beyond.map((r) => r.id)).toEqual(['a']);
  });

  it('drops streams with null predictedNextDate', () => {
    const s = stream({ id: 'a', predictedNextDate: null });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek).toEqual([]);
    expect(result.laterThisMonth).toEqual([]);
    expect(result.nextMonth).toEqual([]);
    expect(result.beyond).toEqual([]);
  });

  it('drops streams with past predictedNextDate (defensive)', () => {
    const s = stream({ id: 'a', predictedNextDate: '2026-05-01' });
    const result = groupByDateWindow([s], TODAY);
    expect(result.thisWeek).toEqual([]);
    expect(result.laterThisMonth).toEqual([]);
    expect(result.nextMonth).toEqual([]);
    expect(result.beyond).toEqual([]);
  });

  it('sorts within bucket by predictedNextDate ascending', () => {
    const wednesday = new Date('2026-05-13T00:00:00Z');
    const a = stream({ id: 'a', predictedNextDate: '2026-05-17' });
    const b = stream({ id: 'b', predictedNextDate: '2026-05-15' });
    const c = stream({ id: 'c', predictedNextDate: '2026-05-16' });
    const result = groupByDateWindow([a, b, c], wednesday);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('handles today-is-Sunday boundary: today→thisWeek, tomorrow→laterThisMonth', () => {
    // TODAY is Sunday 2026-05-10. End-of-this-week IS today.
    // Tomorrow (Mon 2026-05-11) is the start of next week.
    const todayStream = stream({ id: 'a', predictedNextDate: '2026-05-10' });
    const tomorrowStream = stream({ id: 'b', predictedNextDate: '2026-05-11' });
    const result = groupByDateWindow([todayStream, tomorrowStream], TODAY);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.laterThisMonth.map((r) => r.id)).toEqual(['b']);
  });

  it('handles today-is-last-day-of-month boundary: today→thisWeek, tomorrow→nextMonth', () => {
    const eom = new Date('2026-05-31T00:00:00Z'); // Sunday + last day of May
    const todayStream = stream({ id: 'a', predictedNextDate: '2026-05-31' });
    const tomorrowStream = stream({ id: 'b', predictedNextDate: '2026-06-01' });
    const result = groupByDateWindow([todayStream, tomorrowStream], eom);
    expect(result.thisWeek.map((r) => r.id)).toEqual(['a']);
    expect(result.nextMonth.map((r) => r.id)).toEqual(['b']);
  });
});

// ---------- pickNextCharge ----------

describe('pickNextCharge', () => {
  const TODAY = new Date('2026-05-10T00:00:00Z');

  it('returns null for empty input', () => {
    expect(pickNextCharge([], TODAY)).toBeNull();
  });

  it('returns null when no streams have predictedNextDate', () => {
    const a = stream({ id: 'a', predictedNextDate: null });
    expect(pickNextCharge([a], TODAY)).toBeNull();
  });

  it('returns the stream with the earliest non-null, non-past date', () => {
    const a = stream({ id: 'a', predictedNextDate: '2026-05-20' });
    const b = stream({ id: 'b', predictedNextDate: '2026-05-15' });
    const c = stream({ id: 'c', predictedNextDate: '2026-05-01' }); // past, ignored
    const result = pickNextCharge([a, b, c], TODAY);
    expect(result?.stream.id).toBe('b');
    expect(result?.dateIso).toBe('2026-05-15');
  });
});

// ---------- trendIndicator ----------

describe('trendIndicator', () => {
  it('returns up when lastAmount > averageAmount * 1.05', () => {
    const s = stream({ averageAmount: 100, lastAmount: 110 });
    expect(trendIndicator(s)).toBe('up');
  });

  it('returns down when lastAmount < averageAmount * 0.95', () => {
    const s = stream({ averageAmount: 100, lastAmount: 90 });
    expect(trendIndicator(s)).toBe('down');
  });

  it('returns flat when lastAmount is within ±5% of averageAmount', () => {
    const s = stream({ averageAmount: 100, lastAmount: 102 });
    expect(trendIndicator(s)).toBe('flat');
  });

  it('returns flat when averageAmount is null', () => {
    const s = stream({ averageAmount: null, lastAmount: 100 });
    expect(trendIndicator(s)).toBe('flat');
  });

  it('returns flat when lastAmount is null', () => {
    const s = stream({ averageAmount: 100, lastAmount: null });
    expect(trendIndicator(s)).toBe('flat');
  });
});
