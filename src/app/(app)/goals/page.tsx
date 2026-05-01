import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import {
  ProgressBar,
  spendCapTone,
} from '@/components/goals/progress-bar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type GoalWithProgress,
  getGoalsWithProgress,
} from '@/lib/db/queries/goals';
import { deleteGoal } from '@/lib/goals/actions';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const goals = await getGoalsWithProgress(session.user.id);

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Savings targets and spending caps. Progress updates automatically
            as your accounts sync.
          </p>
        </div>
        <Button asChild>
          <Link href="/goals/new">
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No goals yet</CardTitle>
            <CardDescription>
              Create your first goal — start with an emergency fund target
              or a monthly discretionary cap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/goals/new">Create a goal</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const deleteAction = deleteGoal.bind(null, goal.id);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{goal.name}</CardTitle>
          <CardDescription>
            {goal.type === 'savings' ? 'Savings target' : 'Monthly spend cap'}
            {goal.targetDate && ` · by ${formatDate(goal.targetDate)}`}
          </CardDescription>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/goals/${goal.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <form action={deleteAction}>
            <Button type="submit" variant="ghost" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBlock goal={goal} />
        {goal.scopedAccountNames.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
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
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Categories
              </p>
              <p className="text-xs text-muted-foreground">
                {goal.categoryFilter.map(humanize).join(' · ')}
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}

function ProgressBlock({ goal }: { goal: GoalWithProgress }) {
  const p = goal.progress;
  if (p.type === 'savings') {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(p.current)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
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
            ' · Target hit 🎉'
          ) : (
            <> · {formatCurrency(p.remaining)} to go</>
          )}
        </p>
        {p.remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {p.monthlyVelocity > 0 ? (
              <>
                Adding{' '}
                <span className="text-positive font-medium">
                  {formatCurrency(p.monthlyVelocity)}/mo
                </span>{' '}
                (90-day avg)
                {p.projectedDate && (
                  <> · projected to hit by {formatDate(p.projectedDate)}</>
                )}
              </>
            ) : p.monthlyVelocity < 0 ? (
              <span className="text-destructive">
                Net{' '}
                {formatCurrency(p.monthlyVelocity)}/mo (90-day avg) — not on
                track
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
          className={`text-2xl font-semibold tabular-nums ${
            overCap ? 'text-destructive' : ''
          }`}
        >
          {formatCurrency(p.spent)}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
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
          <span className="text-yellow-600">
            On pace to spend{' '}
            <span className="font-medium">
              {formatCurrency(p.projectedMonthly)}
            </span>{' '}
            this month — over cap by{' '}
            {formatCurrency(p.projectedMonthly - p.cap)}
          </span>
        ) : overCap ? (
          <>
            Projected total this month:{' '}
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
