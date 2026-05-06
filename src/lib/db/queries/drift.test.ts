import { describe, expect, it } from 'vitest';
import {
  MAX_LEADERBOARD_ROWS,
  MIN_BASELINE,
  buildLeaderboard,
} from './drift';

/**
 * The full lookback layout has weeks [w0..w11] where w0..w3 are the
 * baseline-only seed and w4..w11 are visible. For these tests the
 * absolute layout doesn't matter — buildLeaderboard takes the raw
 * per-category bucket and the index of the current week. Tests use
 * a 5-slot bucket where index 4 is "current" and 0..3 are baseline.
 */
const CURRENT_IDX = 4;

function bucket(...weeks: number[]): number[] {
  return weeks;
}

describe('buildLeaderboard', () => {
  it('includes a category that clears the floor on both current and baseline', () => {
    const perCat = new Map([
      // baseline median = median(100, 100, 100, 100) = 100, current = 250 → 2.5×
      ['DINING', bucket(100, 100, 100, 100, 250)],
    ]);
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'DINING',
      currentTotal: 250,
      baselineWeekly: 100,
      ratio: 2.5,
      isElevated: true,
    });
  });

  it('drops a category whose current is below MIN_BASELINE (stopped spending)', () => {
    const perCat = new Map([
      ['GYM', bucket(100, 100, 100, 100, MIN_BASELINE - 1)],
    ]);
    expect(buildLeaderboard(perCat, CURRENT_IDX)).toEqual([]);
  });

  it('drops a category whose baseline is below MIN_BASELINE (new spend)', () => {
    const perCat = new Map([
      ['NEW_THING', bucket(0, 0, 0, 0, 200)],
    ]);
    expect(buildLeaderboard(perCat, CURRENT_IDX)).toEqual([]);
  });

  it('marks isElevated only for cats above flagging thresholds', () => {
    const perCat = new Map([
      // current=200, baseline=100, ratio=2.0 → elevated (≥1.5× and ≥$50)
      ['HOT', bucket(100, 100, 100, 100, 200)],
      // current=110, baseline=100, ratio=1.1 → above floor but flat → NOT elevated
      ['FLAT', bucket(100, 100, 100, 100, 110)],
    ]);
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows.find((r) => r.category === 'HOT')?.isElevated).toBe(true);
    expect(rows.find((r) => r.category === 'FLAT')?.isElevated).toBe(false);
  });

  it('sorts rows by ratio descending', () => {
    const perCat = new Map([
      ['HOT', bucket(100, 100, 100, 100, 250)], // 2.5×
      ['WARM', bucket(100, 100, 100, 100, 150)], // 1.5×
      ['FLAT', bucket(100, 100, 100, 100, 100)], // 1.0×
      ['COOL', bucket(100, 100, 100, 100, 50)], // 0.5×
    ]);
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows.map((r) => r.category)).toEqual([
      'HOT',
      'WARM',
      'FLAT',
      'COOL',
    ]);
  });

  it('caps at MAX_LEADERBOARD_ROWS rows', () => {
    const perCat = new Map<string, number[]>();
    // Generate 15 cats with varying ratios so all clear the floor.
    for (let i = 1; i <= 15; i++) {
      perCat.set(`CAT_${i}`, bucket(100, 100, 100, 100, 50 + i * 10));
    }
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows).toHaveLength(MAX_LEADERBOARD_ROWS);
    // Highest-ratio cat (CAT_15: 2.0×) should be first.
    expect(rows[0].category).toBe('CAT_15');
  });

  it('includes cats running cool when they still clear both floors', () => {
    const perCat = new Map([
      // current=$60, baseline=$120 — half of typical, still real spend
      ['DINING', bucket(120, 120, 120, 120, 60)],
    ]);
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows).toHaveLength(1);
    expect(rows[0].ratio).toBe(0.5);
    expect(rows[0].isElevated).toBe(false);
  });

  it('handles empty perCategory map', () => {
    expect(buildLeaderboard(new Map(), CURRENT_IDX)).toEqual([]);
  });

  it('uses median (not mean) for the baseline so a single outlier week does not dominate', () => {
    // One $400 week three weeks ago shouldn't pull the baseline up to ~$160.
    // Median of [100, 100, 100, 400] = (100+100)/2 = 100.
    const perCat = new Map([
      ['DINING', bucket(100, 100, 400, 100, 250)],
    ]);
    const rows = buildLeaderboard(perCat, CURRENT_IDX);
    expect(rows[0].baselineWeekly).toBe(100);
    expect(rows[0].ratio).toBe(2.5);
  });
});
