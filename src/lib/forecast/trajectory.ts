import type { MonthlyProjection } from './types';

/**
 * Daily liquid-cash series for [today, today+daysOut]. Linear-interpolates
 * between projectCash's monthly endCash anchors at day 30 / 60 / 90.
 *
 * Why not run projectCash per-day? The engine bakes recurring streams into
 * monthly endCash; running per-day would generate spurious daily noise as
 * recurring charges flip across day boundaries. The monthly chain is the
 * engine's actual signal; daily interpolation is the visual presentation.
 *
 * Returns daysOut + 1 points (today included).
 */
export function forecastDailySeries(
  startLiquidCash: number,
  projection: MonthlyProjection[],
  daysOut = 90,
): number[] {
  if (daysOut <= 0) return [startLiquidCash];
  if (projection.length === 0) return Array(daysOut + 1).fill(startLiquidCash);

  // Anchor points: day 0 → startCash; day 30 → p[0].endCash; day 60 → p[1].endCash; ...
  const anchors: Array<{ day: number; cash: number }> = [
    { day: 0, cash: startLiquidCash },
  ];
  for (let i = 0; i < projection.length; i++) {
    anchors.push({ day: (i + 1) * 30, cash: projection[i].endCash });
  }

  const series: number[] = [];
  for (let day = 0; day <= daysOut; day++) {
    let lower = anchors[0];
    let upper = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (anchors[i].day <= day && anchors[i + 1].day >= day) {
        lower = anchors[i];
        upper = anchors[i + 1];
        break;
      }
    }
    if (lower.day === upper.day) {
      series.push(lower.cash);
      continue;
    }
    const t = (day - lower.day) / (upper.day - lower.day);
    series.push(lower.cash + (upper.cash - lower.cash) * t);
  }
  return series;
}

/**
 * Symmetric uncertainty band around a forecast series. Half-width at day t
 * is σ × sqrt(t), where σ is the stddev of daily net-worth deltas over the
 * historical series. Returns null when historical < 60 points (honesty
 * floor — variance estimate from too-small a window is false precision
 * dressed as quantified uncertainty).
 */
export function uncertaintyBand(
  historicalDailySeries: number[],
  forecastDailySeries: number[],
): { upper: number[]; lower: number[] } | null {
  if (historicalDailySeries.length < 60) return null;

  const deltas: number[] = [];
  for (let i = 1; i < historicalDailySeries.length; i++) {
    deltas.push(historicalDailySeries[i] - historicalDailySeries[i - 1]);
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance =
    deltas.reduce((acc, d) => acc + (d - mean) ** 2, 0) / deltas.length;
  const sigma = Math.sqrt(variance);

  const upper: number[] = [];
  const lower: number[] = [];
  for (let t = 0; t < forecastDailySeries.length; t++) {
    const halfWidth = sigma * Math.sqrt(t);
    upper.push(forecastDailySeries[t] + halfWidth);
    lower.push(forecastDailySeries[t] - halfWidth);
  }
  return { upper, lower };
}
