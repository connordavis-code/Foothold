// src/components/goals/trajectory-chart.tsx
'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrajectoryPoint } from '@/lib/goals/trajectory';
import { formatCurrency } from '@/lib/utils';

type Props = {
  series: TrajectoryPoint[];
  windowStart: string;
  windowEnd: string;
  /** Goal target ($) or cap ($) — drawn as a horizontal reference line. */
  target: number;
  /** Behind/over → amber fill; on-pace → foreground hue. */
  isBehind: boolean;
};

/**
 * Cumulative-vs-ideal-pace chart per the locked design from
 * 2026-05-07-phase-3-pt3-goal-detail-design.md § 5.3.
 *
 * Solid line = actual cumulative. Dashed line = linear ideal pace from
 * window start to target at window end. Reference line at target/cap.
 *
 * Empty state (series.length < 7) is rendered by the caller — this
 * component assumes there's enough data to chart.
 */
export function GoalTrajectoryChart({
  series,
  windowStart,
  windowEnd,
  target,
  isBehind,
}: Props) {
  // Compute the ideal-pace line as a synthetic series of just two points
  // (start at $0, end at $target across the window). Recharts plots a
  // straight line between them.
  const idealPace = [
    { date: windowStart, ideal: 0 },
    { date: windowEnd, ideal: target },
  ];
  // Merge actual + ideal into a unified data array keyed by date. Any date
  // missing one half renders as a gap which Recharts handles with
  // connectNulls.
  const data = mergeByDate(series, idealPace);

  const lineColor = isBehind ? 'hsl(var(--chart-3))' : 'hsl(var(--foreground))';
  const fillColor = isBehind ? 'hsl(var(--chart-3))' : 'hsl(var(--foreground))';

  return (
    <div className="aspect-[16/10] w-full md:aspect-[5/2]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number, name) => [formatCurrency(v), name]}
          />
          <ReferenceLine
            y={target}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 3"
            label={{ value: 'Target', position: 'right', fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="Actual"
            stroke={lineColor}
            fill={fillColor}
            fillOpacity={0.12}
            strokeWidth={2}
            connectNulls
          />
          <Line
            type="linear"
            dataKey="ideal"
            name="Ideal pace"
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type MergedRow = {
  date: string;
  cumulative?: number;
  ideal?: number;
};

function mergeByDate(
  actual: TrajectoryPoint[],
  ideal: { date: string; ideal: number }[],
): MergedRow[] {
  const map = new Map<string, MergedRow>();
  for (const p of actual) {
    map.set(p.date, { date: p.date, cumulative: p.cumulative });
  }
  for (const p of ideal) {
    const existing = map.get(p.date);
    if (existing) existing.ideal = p.ideal;
    else map.set(p.date, { date: p.date, ideal: p.ideal });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
