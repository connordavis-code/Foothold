// src/components/goals/detail-header.tsx
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { ArchiveGoalButton } from '@/components/goals/archive-goal-button';
import { DeleteGoalButton } from '@/components/goals/delete-goal-button';
import { Button } from '@/components/ui/button';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeDate } from '@/lib/format/date';
import { paceVerdict } from '@/lib/goals/pace';
import { cn, formatCurrency } from '@/lib/utils';

type Props = { goal: GoalWithProgress };

export function GoalDetailHeader({ goal }: Props) {
  const verdict = paceVerdict(goal);
  const kindLabel = goal.type === 'savings' ? 'Savings goal' : 'Spend cap';
  const created = humanizeDate(goal.createdAt.toISOString().slice(0, 10));
  const numbers =
    goal.progress.type === 'savings'
      ? `${formatCurrency(goal.progress.current)} of ${formatCurrency(goal.progress.target)}`
      : `${formatCurrency(goal.progress.spent)} of ${formatCurrency(goal.progress.cap)}`;
  const fractionPct = Math.round(goal.progress.fraction * 100);

  return (
    <header className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow">
          {kindLabel} · Created {created}
          {!goal.isActive && (
            <span className="ml-2 text-amber-700 dark:text-amber-300">· Archived</span>
          )}
        </p>
        <div className="flex items-center gap-0.5">
          <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Link href={`/goals/${goal.id}/edit`} aria-label="Edit goal">
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <ArchiveGoalButton
            goalId={goal.id}
            goalName={goal.name}
            isArchived={!goal.isActive}
          />
          <DeleteGoalButton goalId={goal.id} goalName={goal.name} />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{goal.name}</h1>
          <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
            {numbers} · {fractionPct}%
          </p>
        </div>
        <StatusPill verdict={verdict} goal={goal} />
      </div>
    </header>
  );
}

function StatusPill({
  verdict,
  goal,
}: {
  verdict: ReturnType<typeof paceVerdict>;
  goal: GoalWithProgress;
}) {
  const { label, tone } = pillFor(verdict, goal);
  const cls = {
    over: 'bg-destructive/10 text-destructive border-destructive/30',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    positive: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    neutral: 'bg-accent text-foreground border-border',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-medium',
        cls[tone],
      )}
    >
      {label}
    </span>
  );
}

function pillFor(
  verdict: ReturnType<typeof paceVerdict>,
  goal: GoalWithProgress,
): { label: string; tone: 'over' | 'warning' | 'positive' | 'neutral' } {
  if (verdict === 'over') return { label: 'Over', tone: 'over' };
  if (verdict === 'hit') return { label: 'Goal hit', tone: 'positive' };
  if (verdict === 'on-pace') return { label: 'On pace', tone: 'neutral' };
  if (goal.progress.type === 'spend_cap') {
    return { label: 'Trending over', tone: 'warning' };
  }
  if (goal.progress.monthlyVelocity <= 0) {
    return { label: 'Not contributing', tone: 'warning' };
  }
  return { label: 'Behind pace', tone: 'warning' };
}
