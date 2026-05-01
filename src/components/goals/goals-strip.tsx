import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { ProgressBar, spendCapTone } from './progress-bar';

/**
 * Compact "at a glance" view for the dashboard. Sorts goals by urgency:
 *   1. Spend caps that are 80%+ utilized this month (most urgent)
 *   2. Savings goals not yet hit
 *   3. Spend caps under 80%
 *   4. Savings goals already hit (deprioritized — still shown)
 *
 * Caps the visible list at 3; the "View all" link opens /goals.
 */
export function GoalsStrip({ goals }: { goals: GoalWithProgress[] }) {
  if (goals.length === 0) return null;

  const sorted = [...goals].sort(urgencyCompare);
  const visible = sorted.slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Goals</CardTitle>
          <CardDescription>
            Top {visible.length} by urgency. Caps near or over the limit
            surface first.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/goals">View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {visible.map((g) => (
            <GoalStripRow key={g.id} goal={g} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GoalStripRow({ goal }: { goal: GoalWithProgress }) {
  const p = goal.progress;
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Link
          href={`/goals/${goal.id}/edit`}
          className="text-sm font-medium hover:underline truncate"
        >
          {goal.name}
        </Link>
        {p.type === 'savings' ? (
          <span className="text-xs tabular-nums text-muted-foreground shrink-0">
            <span className="text-foreground font-medium">
              {formatCurrency(p.current)}
            </span>{' '}
            of {formatCurrency(p.target)}
          </span>
        ) : (
          <span
            className={`text-xs tabular-nums shrink-0 ${
              p.fraction > 1 ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            <span className="text-foreground font-medium">
              {formatCurrency(p.spent)}
            </span>{' '}
            of {formatCurrency(p.cap)}
          </span>
        )}
      </div>
      <ProgressBar
        fraction={Math.min(1, p.fraction)}
        tone={
          p.type === 'savings'
            ? p.fraction >= 1
              ? 'positive'
              : 'neutral'
            : spendCapTone(p.fraction)
        }
      />
      <p className="text-xs text-muted-foreground">{stripSubtitle(goal)}</p>
    </li>
  );
}

function stripSubtitle(goal: GoalWithProgress): string {
  const p = goal.progress;
  if (p.type === 'savings') {
    if (p.remaining === 0) return 'Target hit 🎉';
    if (p.monthlyVelocity > 0 && p.projectedDate) {
      return `${formatPercent(p.fraction)} · +${formatCurrency(p.monthlyVelocity)}/mo · projected ${formatTargetDate(p.projectedDate)}`;
    }
    if (p.monthlyVelocity <= 0) {
      return `${formatPercent(p.fraction)} · not on track at current pace`;
    }
    return `${formatPercent(p.fraction)} · ${formatCurrency(p.remaining)} to go`;
  }
  // spend_cap
  if (p.fraction > 1) {
    return `Over by ${formatCurrency(-p.remaining)} · projected ${formatCurrency(p.projectedMonthly)} EOM`;
  }
  if (p.projectedMonthly > p.cap) {
    return `On pace to overspend by ${formatCurrency(p.projectedMonthly - p.cap)} this month`;
  }
  return `${formatCurrency(p.remaining)} left · projected ${formatCurrency(p.projectedMonthly)} EOM`;
}

function formatTargetDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function urgencyCompare(
  a: GoalWithProgress,
  b: GoalWithProgress,
): number {
  return urgencyScore(b) - urgencyScore(a);
}

/** Higher = more urgent. */
function urgencyScore(g: GoalWithProgress): number {
  if (g.progress.type === 'spend_cap') {
    if (g.progress.fraction > 1) return 1000 + g.progress.fraction;
    if (g.progress.fraction >= 0.8) return 800 + g.progress.fraction * 100;
    return 100 + g.progress.fraction * 100;
  }
  // savings
  if (g.progress.fraction >= 1) return 50; // hit, low priority
  return 500 + g.progress.fraction * 100;
}
