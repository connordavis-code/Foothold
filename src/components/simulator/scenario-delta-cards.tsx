import type { MonthlyProjection } from '@/lib/forecast/types';
import { computeEndDelta } from '@/lib/forecast/comparison';
import { cn, formatCurrency } from '@/lib/utils';

type ScenarioRow = {
  id: string;
  name: string;
  projection: MonthlyProjection[];
  colorVar: string;
};

type Props = {
  baseline: MonthlyProjection[];
  scenarios: ScenarioRow[];
};

/**
 * Per-scenario delta-vs-baseline card row for the compare view.
 *
 * Each card shows: scenario name (color-dotted to match the chart line),
 * end-of-horizon endCash, and signed delta vs baseline (absolute + percent).
 * Color-of-delta tracks the sign (foreground for positive, amber for
 * negative) — restrained, matching DESIGN.md's "single-hue elevated"
 * convention from /drift.
 *
 * Server component — pure layout, no interactivity.
 */
export function ScenarioDeltaCards({ baseline, scenarios }: Props) {
  if (scenarios.length === 0) return null;

  const lastMonth = baseline[baseline.length - 1]?.month ?? '';

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow">End of horizon · {lastMonth}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => {
          const end =
            s.projection[s.projection.length - 1]?.endCash ?? 0;
          const { absolute, percent } = computeEndDelta(s.projection, baseline);
          const isPositive = absolute >= 0;
          return (
            <div
              key={s.id}
              className="rounded-card border border-border bg-surface-elevated p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `hsl(var(${s.colorVar}))` }}
                />
                <p className="truncate text-sm font-medium text-foreground">
                  {s.name}
                </p>
              </div>
              <p className="font-mono text-xl tabular-nums text-foreground">
                {formatCurrency(end)}
              </p>
              <p
                className={cn(
                  'mt-1 font-mono text-xs tabular-nums',
                  isPositive
                    ? 'text-muted-foreground'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {isPositive ? '+' : ''}
                {formatCurrency(absolute)}
                {percent !== null && (
                  <span className="ml-1.5 text-muted-foreground">
                    ({isPositive ? '+' : ''}
                    {percent.toFixed(1)}%)
                  </span>
                )}{' '}
                <span className="text-muted-foreground">vs baseline</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
