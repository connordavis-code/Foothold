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

/**
 * One scenario series ready to plot. Caller owns the color choice via
 * a CSS variable name (`--chart-1` etc.) so the chart adapts to
 * light/dark without re-resolving here.
 */
export type ChartScenario = {
  id: string;
  name: string;
  projection: MonthlyProjection[];
  /** CSS variable name without the `var(...)` wrapper, e.g. '--chart-1'. */
  colorVar: string;
};

type Props = {
  baseline: MonthlyProjection[];
  /**
   * Scenario lines overlaid on baseline. 0 → baseline-only chart;
   * 1 → edit mode (single scenario); 2-3 → compare mode. Caller enforces
   * the 3-cap; this component is variadic on purpose so future use cases
   * (e.g. previewing a template before save) compose without API churn.
   */
  scenarios: ChartScenario[];
};

/**
 * Cash-forecast chart. Renders baseline as dashed grey reference plus
 * one solid line per scenario in `scenarios`. Aspect ratio + legend
 * placement diverge by breakpoint:
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
export function ForecastChart({ baseline, scenarios }: Props) {
  // Pivot from {baseline: MonthlyProjection[], scenarios: [{id, projection: MP[]}]}
  // into a single rechart-friendly array of {month, baseline, [scenarioId]: number}.
  // The scenario keys are scenario.id so dataKey on each <Line> can be the
  // same id — guarantees stable mapping even if names collide.
  const data = useMemo(() => {
    return baseline.map((b, i) => {
      const row: Record<string, string | number> = {
        month: b.month,
        baseline: b.endCash,
      };
      for (const s of scenarios) {
        row[s.id] = s.projection[i]?.endCash ?? 0;
      }
      return row;
    });
  }, [baseline, scenarios]);

  const last = baseline[baseline.length - 1];
  const horizonMonths = baseline.length;
  const lastMonth = last?.month ?? '';
  // Header summary line: when 0 scenarios are selected, show baseline end
  // value. When 1+, show the first scenario's end value (matches edit mode's
  // existing "scenario-forward" emphasis) — the delta cards row covers the
  // multi-scenario comparison numbers.
  const headlineEnd =
    scenarios[0]?.projection[scenarios[0].projection.length - 1]?.endCash ??
    last?.endCash ??
    0;

  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-eyebrow">Cash forecast</p>
          <p className="text-sm text-foreground">
            {horizonMonths} months · {lastMonth} projected{' '}
            <span className="font-mono tabular-nums">
              {formatCurrency(headlineEnd)}
            </span>
          </p>
        </div>
        {/* Inline legend — desktop only. Mobile renders the legend below
            the chart so the chart itself can claim full width. */}
        <Legend
          scenarios={scenarios}
          className="hidden md:inline-block"
        />
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
              trigger="click"
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                fontSize: 12,
              }}
              formatter={(value: number, key: string) => {
                // Map the dataKey (scenario.id or 'baseline') back to a
                // human-readable label for the tooltip. Recharts passes
                // the key as the second arg.
                if (key === 'baseline') return [formatCurrency(value), 'baseline'];
                const s = scenarios.find((x) => x.id === key);
                return [formatCurrency(value), s?.name ?? key];
              }}
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
            {scenarios.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                stroke={`hsl(var(${s.colorVar}))`}
                strokeWidth={1.5}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Below-chart legend — mobile only. */}
      <div className="mt-3 md:hidden">
        <Legend scenarios={scenarios} />
      </div>
    </section>
  );
}

function Legend({
  scenarios,
  className,
}: {
  scenarios: ChartScenario[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-px w-3 bg-muted-foreground/50" />
        baseline
      </span>
      {scenarios.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-px w-3"
            style={{ background: `hsl(var(${s.colorVar}))` }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}
