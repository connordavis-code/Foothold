// src/components/goals/projection-card.tsx
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { humanizeDate } from '@/lib/format/date';
import { paceVerdict } from '@/lib/goals/pace';
import { formatCurrency } from '@/lib/utils';

type Props = { goal: GoalWithProgress };

/**
 * Headline projection sentence — varies by goal type AND whether projection
 * is favorable. All copy lives here (not in the predicate) because the
 * projection inputs come straight from goal.progress; no derived computation
 * worth extracting yet.
 */
export function GoalProjectionCard({ goal }: Props) {
  const verdict = paceVerdict(goal);
  const sentence = projectionSentence(goal, verdict);
  return (
    <section className="rounded-card border border-border bg-card p-5 sm:p-6">
      <p className="text-eyebrow mb-2">Projection</p>
      <p className="text-base leading-snug text-foreground">{sentence}</p>
    </section>
  );
}

function projectionSentence(
  goal: GoalWithProgress,
  verdict: ReturnType<typeof paceVerdict>,
): string {
  const p = goal.progress;
  if (p.type === 'spend_cap') {
    if (verdict === 'over') {
      const overage = p.spent - p.cap;
      const today = new Date();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const daysLeft = Math.max(
        0,
        monthEnd.getDate() - today.getDate(),
      );
      return `Already ${formatCurrency(overage)} over the ${formatCurrency(p.cap)} cap with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left in the month.`;
    }
    if (verdict === 'behind') {
      const overage = p.projectedMonthly - p.cap;
      return `Projected month-end: ${formatCurrency(p.projectedMonthly)} (${formatCurrency(overage)} over the ${formatCurrency(p.cap)} cap).`;
    }
    const margin = p.cap - p.projectedMonthly;
    return `Projected month-end spend: ${formatCurrency(p.projectedMonthly)} — comfortably under the ${formatCurrency(p.cap)} cap (${formatCurrency(margin)} headroom).`;
  }

  // savings
  if (verdict === 'hit') {
    return `Hit ${formatCurrency(p.target)} — ${formatCurrency(p.current - p.target)} over target.`;
  }
  if (verdict === 'behind') {
    if (goal.targetDate && p.projectedDate) {
      return `At current pace, you'll be ${formatCurrency(p.target - estimatedAtTargetDate(p, goal.targetDate))} short of the ${humanizeDate(goal.targetDate)} target. ETA at this rate: ${humanizeDate(p.projectedDate)}.`;
    }
    return `At current pace (${formatCurrency(p.monthlyVelocity)}/mo), this goal is not yet on track.`;
  }
  // on-pace
  if (p.projectedDate) {
    return `Projected to hit ${formatCurrency(p.target)} by ${humanizeDate(p.projectedDate)}.`;
  }
  return `Tracking toward ${formatCurrency(p.target)} at ${formatCurrency(p.monthlyVelocity)}/mo.`;
}

function estimatedAtTargetDate(
  p: Extract<GoalWithProgress['progress'], { type: 'savings' }>,
  targetDateIso: string,
): number {
  const target = new Date(targetDateIso + 'T00:00:00Z');
  const today = new Date();
  const monthsRemaining = Math.max(
    0,
    (target.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  return p.current + p.monthlyVelocity * monthsRemaining;
}
