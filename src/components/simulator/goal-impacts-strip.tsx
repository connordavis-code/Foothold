'use client';

import type { GoalImpact } from '@/lib/forecast/types';
import { formatGoalImpact, sortGoalImpacts } from './goal-impacts-logic';

type Props = {
  goalImpacts: GoalImpact[];
};

// Single foreground hue for "faster", caution amber for "slower", muted for
// "same" — DESIGN.md restraint (one accent + amber for elevated only).
function deltaColor(statusKey: ReturnType<typeof formatGoalImpact>['statusKey']): string {
  if (statusKey === 'faster') return 'hsl(var(--accent))';
  if (statusKey === 'slower') return 'var(--semantic-caution)';
  return 'var(--text-3)';
}

/**
 * R.4 replacement for the <GoalImpacts> cards row. A thin horizontal strip
 * below the chart: one cell per goal showing name + new arrival + delta vs the
 * goal_move-augmented baseline. Horizontal scroll on mobile; full-width row at
 * ≥md. Reuses the cards-row pure formatters so wording stays identical across
 * the two surfaces.
 */
export function GoalImpactsStrip({ goalImpacts }: Props) {
  if (goalImpacts.length === 0) return null;

  const sorted = sortGoalImpacts(goalImpacts);

  return (
    <section aria-label="Goal impacts">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-eyebrow">Goal impacts</h3>
        <span className="text-xs text-text-3">vs baseline</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:auto-cols-fr md:grid-flow-col md:overflow-visible">
        {sorted.map((impact) => {
          const f = formatGoalImpact(impact);
          const color = deltaColor(f.statusKey);
          return (
            <div
              key={impact.goalId}
              className="min-w-[150px] flex-shrink-0 rounded-card border border-hairline bg-surface px-3 py-2 md:min-w-0"
            >
              <p className="truncate text-xs text-text-2" title={impact.name}>
                {impact.name}
              </p>
              <p
                className="mt-1 font-mono text-sm tabular-nums text-foreground"
                style={{ letterSpacing: '-0.02em' }}
              >
                {f.arrivalLabel}
              </p>
              <p className="mt-0.5 text-xs" style={{ color }}>
                {f.deltaLabel}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
