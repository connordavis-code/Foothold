import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { DeleteGoalButton } from '@/components/goals/delete-goal-button';
import { ProgressBar } from '@/components/goals/progress-bar';
import { Button } from '@/components/ui/button';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeCategory } from '@/lib/format/category';
import { paceVerdict } from '@/lib/goals/pace';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  goal: GoalWithProgress;
};

export function GoalRow({ goal }: Props) {
  const v = paceVerdict(goal);
  const drilldown = drilldownHref(goal, v);
  const numbers = numbersLine(goal);
  const lever = leverCopy(goal, v);
  const tick = tickFraction(goal);
  const tone = barTone(v, goal);
  const fraction = goal.progress.fraction;
  const pill = verdictPill(goal, v);
  const kindLabel = goal.type === 'savings' ? 'Savings' : 'Spend cap';

  return (
    <li className="relative px-5 py-4 sm:px-6">
      {drilldown && (
        <Link
          href={drilldown}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`See transactions for ${goal.name}`}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate text-sm font-medium">{goal.name}</h2>
            <span className="text-eyebrow shrink-0">{kindLabel}</span>
          </div>
          <ProgressBar
            fraction={fraction}
            tone={tone}
            tickFraction={tick ?? undefined}
          />
          <p className="text-xs text-muted-foreground">{lever}</p>
          {scopeLine(goal) && (
            <p className="truncate text-xs text-muted-foreground/80">
              {scopeLine(goal)}
            </p>
          )}
        </div>

        <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5 text-right">
          <p
            className={cn(
              'whitespace-nowrap font-mono text-sm font-medium tabular-nums',
              v === 'over' && 'text-destructive',
            )}
          >
            {numbers}
          </p>
          <VerdictPill {...pill} />
          <div className="flex gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
            >
              <Link href={`/goals/${goal.id}/edit`} aria-label="Edit goal">
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <DeleteGoalButton goalId={goal.id} goalName={goal.name} />
          </div>
        </div>
      </div>
    </li>
  );
}

function VerdictPill({
  label,
  tone,
}: {
  label: string;
  tone: 'over' | 'warning' | 'neutral' | 'positive';
}) {
  const cls = {
    over:
      'bg-destructive/10 text-destructive',
    warning:
      'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    neutral: 'bg-muted text-muted-foreground',
    positive:
      'bg-positive/10 text-positive',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        cls,
      )}
    >
      {label}
    </span>
  );
}

function drilldownHref(
  goal: GoalWithProgress,
  v: ReturnType<typeof paceVerdict>,
): string | null {
  if (goal.type !== 'spend_cap') return null;
  const params = new URLSearchParams();
  const monthStart = currentMonthStartIso();
  params.set('from', monthStart);
  if (goal.categoryFilter && goal.categoryFilter.length > 0) {
    params.set('category', goal.categoryFilter[0]);
  } else if (goal.accountIds && goal.accountIds.length > 0) {
    params.set('account', goal.accountIds[0]);
  } else {
    return null;
  }
  void v;
  return `/transactions?${params.toString()}`;
}

function numbersLine(goal: GoalWithProgress): string {
  if (goal.progress.type === 'savings') {
    return `${formatCurrency(goal.progress.current)} / ${formatCurrency(goal.progress.target)}`;
  }
  return `${formatCurrency(goal.progress.spent)} / ${formatCurrency(goal.progress.cap)}`;
}

function leverCopy(
  goal: GoalWithProgress,
  v: ReturnType<typeof paceVerdict>,
): string {
  const p = goal.progress;
  if (p.type === 'spend_cap') {
    if (v === 'over') {
      return `Over by ${formatCurrency(p.spent - p.cap)} this month`;
    }
    if (v === 'behind') {
      const overage = p.projectedMonthly - p.cap;
      return `Projected ${formatCurrency(p.projectedMonthly)} · over by ${formatCurrency(overage)}`;
    }
    return `Projected ${formatCurrency(p.projectedMonthly)} this month`;
  }
  if (v === 'hit') return 'Goal reached';
  if (v === 'behind') {
    if (p.monthlyVelocity <= 0) {
      return 'No net contribution detected over the last 90 days';
    }
    if (goal.targetDate && p.projectedDate) {
      const months = monthsBetween(goal.targetDate, p.projectedDate);
      return `ETA ${formatMonth(p.projectedDate)} · ${months}mo late`;
    }
    return 'Behind pace';
  }
  if (p.projectedDate) {
    const monthlyAdd = `~${formatCurrency(p.monthlyVelocity)}/mo`;
    return `Adding ${monthlyAdd} · ETA ${formatMonth(p.projectedDate)}`;
  }
  return `Adding ~${formatCurrency(p.monthlyVelocity)}/mo`;
}

function tickFraction(goal: GoalWithProgress): number | null {
  if (goal.progress.type === 'spend_cap') {
    if (goal.progress.cap <= 0) return null;
    return goal.progress.projectedMonthly / goal.progress.cap;
  }
  if (!goal.targetDate) return null;
  const created = +goal.createdAt;
  const target = Date.parse(goal.targetDate);
  if (!Number.isFinite(target) || target <= created) return null;
  const elapsed = Date.now() - created;
  if (elapsed <= 0) return 0;
  return elapsed / (target - created);
}

function barTone(
  v: ReturnType<typeof paceVerdict>,
  goal: GoalWithProgress,
): 'positive' | 'negative' | 'warning' | 'neutral' {
  if (v === 'over') return 'negative';
  if (v === 'hit') return 'positive';
  if (v === 'behind') return 'warning';
  void goal;
  return 'neutral';
}

function verdictPill(
  goal: GoalWithProgress,
  v: ReturnType<typeof paceVerdict>,
): { label: string; tone: 'over' | 'warning' | 'neutral' | 'positive' } {
  if (v === 'over') return { label: 'Over', tone: 'over' };
  if (v === 'hit') return { label: 'Goal hit', tone: 'positive' };
  if (v === 'on-pace') return { label: 'On pace', tone: 'neutral' };
  if (goal.progress.type === 'spend_cap') {
    return { label: 'Trending over', tone: 'warning' };
  }
  if (goal.progress.monthlyVelocity <= 0) {
    return { label: 'Not contributing', tone: 'warning' };
  }
  return { label: 'Behind pace', tone: 'warning' };
}

function scopeLine(goal: GoalWithProgress): string | null {
  const parts: string[] = [];
  if (goal.scopedAccountNames.length > 0) {
    parts.push(goal.scopedAccountNames.join(' · '));
  }
  if (
    goal.type === 'spend_cap' &&
    goal.categoryFilter &&
    goal.categoryFilter.length > 0
  ) {
    parts.push(goal.categoryFilter.map(humanizeCategory).join(' · '));
  }
  return parts.length > 0 ? parts.join(' — ') : null;
}

function currentMonthStartIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function formatMonth(d: string): string {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function monthsBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24 * 30)));
}
