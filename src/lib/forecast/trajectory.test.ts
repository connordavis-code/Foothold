import { describe, expect, it } from 'vitest';
import { forecastDailySeries, uncertaintyBand } from './trajectory';
import type { MonthlyProjection } from './types';

const month = (endCash: number, label = '2026-06'): MonthlyProjection => ({
  month: label,
  startCash: 0,
  inflows: 0,
  outflows: 0,
  endCash,
  byCategory: {},
  goalProgress: {},
});

describe('forecastDailySeries', () => {
  it('returns daysOut + 1 points (today + daysOut future days)', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series).toHaveLength(91);
  });

  it('day 0 equals startLiquidCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[0]).toBe(1000);
  });

  it('day 30 approximately equals projection[0].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[30]).toBeCloseTo(900, 0);
  });

  it('day 60 approximately equals projection[1].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[60]).toBeCloseTo(800, 0);
  });

  it('day 90 approximately equals projection[2].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[90]).toBeCloseTo(700, 0);
  });

  it('handles negative endCash (over-budget projection)', () => {
    const series = forecastDailySeries(500, [month(-200), month(-500), month(-800)], 90);
    expect(series[90]).toBeCloseTo(-800, 0);
  });

  it('returns single-element [startCash] when daysOut=0', () => {
    const series = forecastDailySeries(1000, [month(900)], 0);
    expect(series).toEqual([1000]);
  });

  it('handles empty projection by holding startCash flat', () => {
    const series = forecastDailySeries(1000, [], 30);
    expect(series).toEqual(Array(31).fill(1000));
  });
});

describe('uncertaintyBand', () => {
  it('returns null when historical < 60 points', () => {
    const hist = Array(59)
      .fill(0)
      .map((_, i) => 1000 + i);
    const fcast = Array(91)
      .fill(0)
      .map((_, i) => 1059 + i);
    expect(uncertaintyBand(hist, fcast)).toBeNull();
  });

  it('returns band with zero half-spread when stddev = 0', () => {
    // Constant historical → daily delta = 0 → stddev = 0
    const hist = Array(91).fill(1000);
    const fcast = Array(91)
      .fill(0)
      .map((_, i) => 1000 - i);
    const band = uncertaintyBand(hist, fcast);
    expect(band).not.toBeNull();
    expect(band!.upper[0]).toBeCloseTo(fcast[0], 5);
    expect(band!.lower[0]).toBeCloseTo(fcast[0], 5);
    expect(band!.upper[90]).toBeCloseTo(fcast[90], 5);
  });

  it('band widens monotonically with forecast horizon', () => {
    // Synthetic random-walk historical (nonzero stddev)
    const hist = [1000];
    for (let i = 1; i < 91; i++) {
      hist.push(hist[i - 1] + (i % 2 === 0 ? 10 : -8));
    }
    const fcast = Array(91)
      .fill(0)
      .map((_, i) => hist[hist.length - 1] - i);
    const band = uncertaintyBand(hist, fcast)!;
    const halfWidth = (i: number) => band.upper[i] - band.lower[i];
    expect(halfWidth(60)).toBeGreaterThan(halfWidth(10));
    expect(halfWidth(10)).toBeGreaterThan(halfWidth(0));
  });

  it('upper/lower symmetric around forecast line', () => {
    const hist = Array(91)
      .fill(0)
      .map((_, i) => 1000 + (i % 10) * 20);
    const fcast = Array(91)
      .fill(0)
      .map((_, i) => 1080 + i);
    const band = uncertaintyBand(hist, fcast)!;
    band.upper.forEach((u, i) => {
      const center = (u + band.lower[i]) / 2;
      expect(center).toBeCloseTo(fcast[i], 5);
    });
  });
});
