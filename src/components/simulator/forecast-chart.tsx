'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MonthlyProjection } from '@/lib/forecast/types';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  baseline: MonthlyProjection[];
  scenario: MonthlyProjection[];
};

/**
 * Cash-forecast chart. Aspect ratio + legend placement diverge by
 * breakpoint:
 *
 *  - <md: aspect-square viewport so the chart reads tall + readable
 *    on phone; legend renders below the chart.
 *  - md+: fixed h-[280px], legend inline in the header (operator
 *    layout).
 *
 * Tooltip uses Recharts' `trigger="click"` on touch devices so the
 * user can tap a data point to inspect — hover doesn't exist on
 * touch. The same Tooltip element receives hover on md+ via the
 * default cursor behavior.
 */
export function ForecastChart({ baseline, scenario }: Props) {
  const data = useMemo(() => {
    return scenario.map((m, i) => ({
      month: m.month,
      scenario: m.endCash,
      baseline: baseline[i]?.endCash ?? 0,
    }));
  }, [baseline, scenario]);

  const finalEndCash = scenario[scenario.length - 1]?.endCash ?? 0;
  const lastMonth = scenario[scenario.length - 1]?.month ?? '';

  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-eyebrow">Cash forecast</p>
          <p className="text-sm text-foreground">
            {scenario.length} months · {lastMonth} projected{' '}
            <span className="font-mono tabular-nums">
              {formatCurrency(finalEndCash)}
            </span>
          </p>
        </div>
        {/* Inline legend — desktop only. Mobile renders the legend below
            the chart so the chart itself can claim full width. */}
        <Legend className="hidden md:inline-block" />
      </header>
      <div className={cn('aspect-square w-full', 'md:aspect-auto md:h-[280px]')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCurrency(v, { compact: true })}
            />
            <Tooltip
              // trigger="click" makes the tooltip open on tap on touch
              // devices (hover doesn't exist on touch). Desktop click
              // also opens it; the dot remains hover-targetable for
              // mouse users.
              trigger="click"
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                fontSize: 12,
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.5}
              strokeWidth={1.25}
              strokeDasharray="3 3"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="scenario"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Below-chart legend — mobile only. */}
      <div className="mt-3 md:hidden">
        <Legend />
      </div>
    </section>
  );
}

function Legend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'text-[11px] text-muted-foreground',
        className,
      )}
    >
      <span className="mr-1.5 inline-block h-px w-3 bg-muted-foreground/50 align-middle"></span>
      baseline
      <span className="ml-3 mr-1.5 inline-block h-px w-3 bg-foreground align-middle"></span>
      scenario
    </div>
  );
}
