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
import { formatCurrency } from '@/lib/utils';

type Props = {
  baseline: MonthlyProjection[];
  scenario: MonthlyProjection[];
};

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
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Cash forecast
          </div>
          <div className="text-sm text-foreground mt-0.5">
            {scenario.length} months · {lastMonth} projected {formatCurrency(finalEndCash)}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <span className="inline-block w-3 h-px bg-muted-foreground/50 align-middle mr-1.5"></span>
          baseline
          <span className="inline-block w-3 h-px bg-foreground align-middle ml-3 mr-1.5"></span>
          scenario
        </div>
      </header>
      <div className="h-[220px]">
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
    </section>
  );
}
