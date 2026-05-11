import { describe, expect, it } from 'vitest';
import { walkbackPortfolio } from './walkback';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('walkbackPortfolio', () => {
  it('returns daysBack + 1 points anchored to currentValue when no txns', () => {
    const out = walkbackPortfolio(1000, [], 3, day('2026-05-11'));
    expect(out).toHaveLength(4);
    expect(out.every((p) => p.value === 1000)).toBe(true);
    expect(out.every((p) => p.estimated === true)).toBe(true);
  });

  it('orders points oldest-first ascending', () => {
    const out = walkbackPortfolio(1000, [], 2, day('2026-05-11'));
    expect(out.map((p) => p.date)).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
    ]);
  });

  it('daysBack=0 yields a single point at today', () => {
    const out = walkbackPortfolio(500, [], 0, day('2026-05-11'));
    expect(out).toEqual([
      { date: '2026-05-11', value: 500, estimated: true },
    ]);
  });

  it('cash-in deposit today (amount=-100): yesterday had 100 less', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -100, type: 'cash' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(900);
    expect(out.find((p) => p.date === '2026-05-11')?.value).toBe(1000);
  });

  it('cash-out withdrawal today (amount=+100): yesterday had 100 more', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 100, type: 'cash' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(1100);
    expect(out.find((p) => p.date === '2026-05-11')?.value).toBe(1000);
  });

  it('fee today (amount=+10): yesterday had 10 more', () => {
    const out = walkbackPortfolio(
      990,
      [{ date: '2026-05-11', amount: 10, type: 'fee' }],
      1,
      day('2026-05-11'),
    );
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(1000);
  });

  it('buy txn (type=buy) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 500, type: 'buy' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('sell txn (type=sell) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -200, type: 'sell' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('dividend txn (type=dividend) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -50, type: 'dividend' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('cancel txn (type=cancel) is filtered out — flat walkback', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: 100, type: 'cancel' }],
      1,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.value === 1000)).toBe(true);
  });

  it('sums multiple txns on the same day', () => {
    const out = walkbackPortfolio(
      1000,
      [
        { date: '2026-05-11', amount: 50, type: 'fee' },
        { date: '2026-05-11', amount: -200, type: 'cash' },
        { date: '2026-05-11', amount: 99, type: 'buy' }, // filtered
      ],
      1,
      day('2026-05-11'),
    );
    // Net amount filtered: 50 + -200 = -150
    // yesterday = today + (-150) = 1000 - 150 = 850
    expect(out.find((p) => p.date === '2026-05-10')?.value).toBe(850);
  });

  it('flat segments where no txns occur on a day', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-10', amount: -100, type: 'cash' }],
      2,
      day('2026-05-11'),
    );
    // End-of-day semantics: each point is the value AFTER that day's
    // txns settle. 5-10's cash-in lands on 5-10 EOD (1000). 5-11 has
    // no txns → flat from 5-10 (still 1000). 5-09 is before the
    // deposit (900).
    expect(out.map((p) => p.value)).toEqual([900, 1000, 1000]);
  });

  it('all points flagged as estimated', () => {
    const out = walkbackPortfolio(
      1000,
      [{ date: '2026-05-11', amount: -100, type: 'cash' }],
      2,
      day('2026-05-11'),
    );
    expect(out.every((p) => p.estimated === true)).toBe(true);
  });
});
