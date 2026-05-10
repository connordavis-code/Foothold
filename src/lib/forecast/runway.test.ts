import { describe, expect, it } from 'vitest';
import { computeRunway, type MonthlyTotals } from './runway';

const m = (inflow: number, outflow: number): MonthlyTotals => ({ inflow, outflow });

describe('computeRunway', () => {
  it('returns null when net-positive (income > outflow)', () => {
    const history = [m(5000, 3000), m(5200, 3100), m(4800, 2900)];
    expect(computeRunway(10000, history)).toBeNull();
  });

  it('returns weeks when net-negative', () => {
    const history = [m(2000, 4000), m(2100, 4200), m(1900, 3900)];
    // medianNetMonthly: net deltas = [2000, 2100, 2000] → sorted [2000, 2000, 2100] → median = 2000
    // runway = 10000 / 2000 × 4.33 = 21.65 wks
    const wks = computeRunway(10000, history);
    expect(wks).toBeCloseTo(21.65, 1);
  });

  it('returns null when net-zero', () => {
    const history = [m(3000, 3000), m(3000, 3000), m(3000, 3000)];
    expect(computeRunway(5000, history)).toBeNull();
  });

  it('uses median, not mean (single-month spike does not skew)', () => {
    const history = [m(2000, 4000), m(2000, 4100), m(2000, 12000)];
    // net deltas = [2000, 2100, 10000] → median = 2100 (NOT mean 4700)
    const wks = computeRunway(10000, history);
    expect(wks).toBeCloseTo(20.62, 1);
  });

  it('returns null when history is empty', () => {
    expect(computeRunway(10000, [])).toBeNull();
  });

  it('returns null when liquidBalance ≤ 0', () => {
    const history = [m(2000, 4000), m(2100, 4200), m(1900, 3900)];
    expect(computeRunway(0, history)).toBeNull();
    expect(computeRunway(-500, history)).toBeNull();
  });
});
