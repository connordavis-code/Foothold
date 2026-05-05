import type { GoalProgress } from '@/lib/db/queries/goals';

const DAY_MS = 24 * 60 * 60 * 1000;

type PaceableGoal = {
  type: 'savings' | 'spend_cap';
  targetDate: string | null;
  progress: GoalProgress;
};

/**
 * Pace as a comparable number where 1.0 = "on pace".
 *
 * Savings:
 *   - already at/over target → 1 (done)
 *   - velocity ≤ 0 (monthsToTarget == null) → 0 (depleting; "not on track" on /goals)
 *   - positive velocity, no targetDate → 1 (no deadline ⇒ progress alone qualifies)
 *   - positive velocity, targetDate passed → 0
 *   - else → monthsRemainingByDate / monthsToTarget. >1 ahead, 1 on pace, <1 behind.
 *
 * SpendCap: binary because SpendCapProgress doesn't expose month-progress fields.
 *   - cap > 0 AND spent <= cap → 1 (in cap)
 *   - else → 0 (over cap or cap unset)
 */
export function paceForGoal(goal: PaceableGoal): number {
  if (goal.progress.type === 'spend_cap') {
    return goal.progress.cap > 0 && goal.progress.spent <= goal.progress.cap
      ? 1
      : 0;
  }
  // savings
  const alreadyHit = goal.progress.fraction >= 1;
  if (alreadyHit) return 1;

  // monthsToTarget is null when velocity ≤ 0 — depleting or stagnant.
  // savings can't be "on pace" regardless of target date.
  if (goal.progress.monthsToTarget == null) return 0;

  // With positive velocity but no target date, the goal is making
  // progress; treat that as on-pace.
  if (goal.targetDate == null) return 1;

  const monthsRemainingByDate = monthsBetween(
    new Date().toISOString().slice(0, 10),
    goal.targetDate,
  );
  if (monthsRemainingByDate <= 0) return 0;
  return monthsRemainingByDate / goal.progress.monthsToTarget;
}

/**
 * Map a pace number to a short status label for UI display.
 * Binary by design — matches /goals's "on track" / "not on track" framing.
 */
export function paceLabel(pace: number): 'on pace' | 'behind' {
  return pace >= 1 ? 'on pace' : 'behind';
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (to.getTime() - from.getTime()) / (30 * DAY_MS);
}
