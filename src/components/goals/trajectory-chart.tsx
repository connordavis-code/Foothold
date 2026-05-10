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
  /** Optional projected continuation (today → windowEnd at current
   * velocity). Two endpoints; rendered as a dashed line in the same hue
   * as `isBehind` selects. Null when projection isn't meaningful (post-
   * target savings, end-of-month spend caps). */
  projection: { startDate: string; startValue: number; endDate: string; endValue: number } | null;
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
  projection,
}: Props) {
  // Compute the ideal-pace line as a synthetic series of just two points
  // (start at $0, end at $target across the window). Recharts plots a
  // straight line between them.
  const idealPace = [
    { date: windowStart, ideal: 0 },
    { date: windowEnd, ideal: target },
  ];
  // Projected continuation — same shape: two endpoints from "today" to
  // window end at current velocity. Null collapses to no extra series.
  const projected = projection
    ? [
        { date: projection.startDate, projected: projection.startValue },
        { date: projection.endDate, projected: projection.endValue },
      ]
    : [];
  // Merge actual + ideal + projected into a unified data array keyed by
  // date. Any date missing a series renders as a gap which Recharts
  // handles with connectNulls.
  const data = mergeByDate(series, idealPace, projected);

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
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`
            }
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
          {projection && (
            <Line
              type="linear"
              dataKey="projected"
              name="Projected"
              stroke={lineColor}
              strokeDasharray="4 3"
              strokeOpacity={0.6}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type MergedRow = {
  date: string;
  cumulative?: number;
  ideal?: number;
  projected?: number;
};

function mergeByDate(
  actual: TrajectoryPoint[],
  ideal: { date: string; ideal: number }[],
  projected: { date: string; projected: number }[],
): MergedRow[] {
  const map = new Map<string, MergedRow>();
  const upsert = (date: string): MergedRow => {
    const existing = map.get(date);
    if (existing) return existing;
    const fresh: MergedRow = { date };
    map.set(date, fresh);
    return fresh;
  };
  for (const p of actual) upsert(p.date).cumulative = p.cumulative;
  for (const p of ideal) upsert(p.date).ideal = p.ideal;
  for (const p of projected) upsert(p.date).projected = p.projected;
  return Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
