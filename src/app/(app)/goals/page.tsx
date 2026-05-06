import { ArrowRight, Pencil, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { DeleteGoalButton } from '@/components/goals/delete-goal-button';
import {
  ProgressBar,
  spendCapTone,
} from '@/components/goals/progress-bar';
import { Button } from '@/components/ui/button';
import {
  type GoalWithProgress,
  getGoalsWithProgress,
} from '@/lib/db/queries/goals';
import { humanizeCategory } from '@/lib/format/category';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const goals = await getGoalsWithProgress(session.user.id);

  if (goals.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-eyebrow">
            Plan
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Goals</h1>
        </div>
        <Button asChild size="sm">
          <Link href="/goals/new">
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {goals.map((g) => (
          <GoalTile key={g.id} goal={g} />
        ))}
      </div>
    </div>
  );
}

function GoalTile({ goal }: { goal: GoalWithProgress }) {
  return (
    <article className="space-y-4 rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 className="truncate text-base font-medium">{goal.name}</h2>
          <p className="text-xs text-muted-foreground">
            {goal.type === 'savings' ? 'Savings target' : 'Monthly spend cap'}
            {goal.targetDate && ` · by ${formatDate(goal.targetDate)}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link href={`/goals/${goal.id}/edit`} aria-label="Edit goal">
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <DeleteGoalButton goalId={goal.id} goalName={goal.name} />
        </div>
      </header>

      <ProgressBlock goal={goal} />

      {goal.scopedAccountNames.length > 0 && (
        <div className="space-y-1">
          <p className="text-eyebrow">
            {goal.type === 'savings' ? 'Accounts' : 'Tracked accounts'}
          </p>
          <p className="text-xs text-muted-foreground">
            {goal.scopedAccountNames.join(' · ')}
          </p>
        </div>
      )}

      {goal.type === 'spend_cap' &&
        goal.categoryFilter &&
        goal.categoryFilter.length > 0 && (
          <div className="space-y-1">
            <p className="text-eyebrow">
              Categories
            </p>
            <p className="text-xs text-muted-foreground">
              {goal.categoryFilter.map(humanizeCategory).join(' · ')}
            </p>
          </div>
        )}
    </article>
  );
}

function ProgressBlock({ goal }: { goal: GoalWithProgress }) {
  const p = goal.progress;
  if (p.type === 'savings') {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-2xl font-semibold tracking-[-0.015em] tabular-nums">
            {formatCurrency(p.current)}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            of {formatCurrency(p.target)}
          </p>
        </div>
        <ProgressBar
          fraction={Math.min(1, p.fraction)}
          tone={p.fraction >= 1 ? 'positive' : 'neutral'}
        />
        <p className="text-xs text-muted-foreground">
          {formatPercent(p.fraction)}
          {p.remaining === 0 ? (
            ' · Target hit'
          ) : (
            <> · {formatCurrency(p.remaining)} to go</>
          )}
        </p>
        {p.remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {p.monthlyVelocity > 0 ? (
              <>
                Adding{' '}
                <span className="font-medium text-positive">
                  {formatCurrency(p.monthlyVelocity)}/mo
                </span>{' '}
                (90-day avg)
                {p.projectedDate && (
                  <> · projected by {formatDate(p.projectedDate)}</>
                )}
              </>
            ) : p.monthlyVelocity < 0 ? (
              <span className="text-destructive">
                Net {formatCurrency(p.monthlyVelocity)}/mo (90-day avg) —
                not on track
              </span>
            ) : (
              <>No net contribution detected over the last 90 days</>
            )}
          </p>
        )}
      </div>
    );
  }
  // spend_cap
  const overCap = p.fraction > 1;
  const projectedOver = !overCap && p.projectedMonthly > p.cap;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p
          className={cn(
            'font-mono text-2xl font-semibold tracking-[-0.015em] tabular-nums',
            overCap && 'text-destructive',
          )}
        >
          {formatCurrency(p.spent)}
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          of {formatCurrency(p.cap)} this month
        </p>
      </div>
      <ProgressBar
        fraction={Math.min(1, p.fraction)}
        tone={spendCapTone(p.fraction)}
      />
      <p className="text-xs text-muted-foreground">
        {overCap
          ? `Over by ${formatCurrency(-p.remaining)}`
          : `${formatCurrency(p.remaining)} left`}
      </p>
      <p className="text-xs text-muted-foreground">
        {projectedOver ? (
          <span className="text-amber-600 dark:text-amber-400">
            On pace for{' '}
            <span className="font-medium">
              {formatCurrency(p.projectedMonthly)}
            </span>{' '}
            — over by{' '}
            {formatCurrency(p.projectedMonthly - p.cap)}
          </span>
        ) : overCap ? (
          <>
            Projected total:{' '}
            <span className="font-medium">
              {formatCurrency(p.projectedMonthly)}
            </span>
          </>
        ) : (
          <>
            On pace for{' '}
            <span className="font-medium">
              {formatCurrency(p.projectedMonthly)}
            </span>{' '}
            this month
          </>
        )}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
          <Target className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set your first goal
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Two flavors: a savings target (an emergency fund, a down
            payment) or a monthly spend cap (eating out, entertainment).
            Progress updates automatically as accounts sync.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/goals/new">
              Create a goal
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

