'use client';

import type { GoalImpact } from '@/lib/forecast/types';
import { cn } from '@/lib/utils';
import {
  formatGoalImpact,
  sortGoalImpacts,
  formatEra,
} from './goal-impacts-logic';

// Re-export pure helpers so callers can import from a single path
export { formatGoalImpact, sortGoalImpacts, formatEra };
export type { FormattedGoalImpact } from './goal-impacts-logic';

const CAP_DEFAULT = 4;

type Props = {
  goalImpacts: GoalImpact[];
};

export function GoalImpacts({ goalImpacts }: Props) {
  if (goalImpacts.length === 0) return null;

  const sorted = sortGoalImpacts(goalImpacts);
  const visible = sorted.slice(0, CAP_DEFAULT);
  const overflow = sorted.length - visible.length;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-medium text-foreground">Goal impacts</h3>
        <span className="text-xs text-text-3">vs baseline projection</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((impact) => (
          <GoalImpactCard key={impact.goalId} impact={impact} />
        ))}
      </div>
      {overflow > 0 && (
        <p className="mt-3 text-xs text-text-3">
          {overflow} more goal{overflow === 1 ? '' : 's'} affected — view all coming soon.
        </p>
      )}
    </section>
  );
}

function GoalImpactCard({ impact }: { impact: GoalImpact }) {
  const f = formatGoalImpact(impact);
  return (
    <div className="rounded-card border border-hairline-strong bg-surface-elevated p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-foreground">{impact.name}</span>
        <Pill statusKey={f.statusKey} />
      </div>
      <div
        className="font-mono text-xl tabular-nums text-foreground"
        style={{ letterSpacing: '-0.02em' }}
      >
        {f.arrivalLabel}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-text-3">was {f.baselineLabel}</span>
        <span
          style={{
            color:
              f.statusKey === 'faster'
                ? 'hsl(var(--accent))'
                : f.statusKey === 'slower'
                ? 'var(--semantic-caution)'
                : 'var(--text-3)',
          }}
        >
          {f.deltaLabel}
        </span>
      </div>
    </div>
  );
}

function Pill({ statusKey }: { statusKey: ReturnType<typeof formatGoalImpact>['statusKey'] }) {
  const label =
    statusKey === 'faster' ? 'faster' : statusKey === 'slower' ? 'slower' : 'same';
  const color =
    statusKey === 'faster'
      ? 'hsl(var(--accent))'
      : statusKey === 'slower'
      ? 'var(--semantic-caution)'
      : 'var(--text-3)';
  return (
    <span
      className={cn('rounded-full border px-2 py-0.5 text-xs')}
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  );
}
