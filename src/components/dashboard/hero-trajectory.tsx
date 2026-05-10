'use client';

import { useMemo } from 'react';

type Props = {
  historicalSeries: number[];
  forecastSeries: number[];
  band: { upper: number[]; lower: number[] } | null;
};

/**
 * Hand-rolled SVG trajectory chart. No Recharts — the chart is simple
 * polylines + a band polygon; Recharts' overhead isn't worth it here.
 *
 * Composes the historical + forecast halves into one continuous coordinate
 * space. Today's position dot sits at the boundary.
 */
export function HeroTrajectory({ historicalSeries, forecastSeries, band }: Props) {
  const allValues = useMemo(() => {
    const values = [...historicalSeries, ...forecastSeries];
    if (band) values.push(...band.upper, ...band.lower);
    return values;
  }, [historicalSeries, forecastSeries, band]);

  if (historicalSeries.length === 0 && forecastSeries.length === 0) {
    return null;
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  // Both halves share "today" — count it once.
  const totalPoints = historicalSeries.length + forecastSeries.length - 1;
  const W = 100;
  const H = 100;

  const xy = (i: number, v: number): [number, number] => {
    const x = (i / Math.max(totalPoints, 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85 - H * 0.075;
    return [x, y];
  };

  const historicalPath = historicalSeries
    .map((v, i) => xy(i, v))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const forecastOffset = historicalSeries.length - 1;
  const forecastPath = forecastSeries
    .map((v, i) => xy(forecastOffset + i, v))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const bandPath = band
    ? (() => {
        const upper = band.upper.map((v, i) => xy(forecastOffset + i, v));
        const lower = band.lower
          .map((v, i) => xy(forecastOffset + i, v))
          .reverse();
        return (
          'M ' +
          upper.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') +
          ' L ' +
          lower.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') +
          ' Z'
        );
      })()
    : null;

  const [todayX, todayY] = xy(
    forecastOffset,
    historicalSeries[historicalSeries.length - 1] ?? forecastSeries[0] ?? 0,
  );

  return (
    <div className="relative" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full">
        {bandPath && <path d={bandPath} fill="var(--semantic-success)" opacity="0.08" />}
        <path
          d={historicalPath}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={forecastPath}
          fill="none"
          stroke="var(--semantic-success)"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="0.6 1.4"
        />
        <line
          x1={todayX}
          y1="0"
          x2={todayX}
          y2="100"
          stroke="var(--text-3)"
          strokeWidth="0.4"
          strokeDasharray="0.6 1.2"
          opacity="0.35"
        />
        <circle cx={todayX} cy={todayY} r="1.6" fill="var(--semantic-success)" />
        <circle cx={todayX} cy={todayY} r="3" fill="var(--semantic-success)" opacity="0.18" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-[--text-3]">
        <span>90 days back</span>
        <span>today</span>
        <span>+90 days</span>
      </div>
    </div>
  );
}
