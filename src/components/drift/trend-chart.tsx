'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryHistory } from '@/lib/db/queries/drift';

/**
 * Colors picked to read distinctly even in the legend swatches. Matches
 * shadcn's neutral aesthetic without competing with the destructive /
 * positive accent colors used elsewhere.
 */
const COLORS = [
  '#10b981',
  '#0ea5e9',
  '#f59e0b',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
];

const TOP_N = 6;

function humanizeCategory(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatWeek(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${m}/${day}`;
}

export function TrendChart({ histories }: { histories: CategoryHistory[] }) {
  const top = histories.slice(0, TOP_N);

  if (top.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        No category spend in the visible window.
      </div>
    );
  }

  const numWeeks = top[0].weeks.length;
  const data = Array.from({ length: numWeeks }, (_, i) => {
    const row: Record<string, string | number> = {
      week: formatWeek(top[0].weeks[i].weekStart),
    };
    for (const h of top) {
      row[h.category] = Math.round(h.weeks[i].total);
    }
    return row;
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: number, name: string) => [
              `$${value.toLocaleString()}`,
              humanizeCategory(name),
            ]}
          />
          <Legend
            formatter={(value: string) => humanizeCategory(value)}
            wrapperStyle={{ fontSize: 12 }}
          />
          {top.map((h, i) => (
            <Line
              key={h.category}
              type="linear"
              dataKey={h.category}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: COLORS[i % COLORS.length] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
