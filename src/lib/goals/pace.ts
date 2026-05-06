import type { GoalWithProgress } from '@/lib/db/queries/goals';

export type PaceVerdict = 'over' | 'behind' | 'on-pace' | 'hit';

export function paceVerdict(goal: GoalWithProgress): PaceVerdict {
  const p = goal.progress;
  if (p.type === 'spend_cap') {
    if (p.fraction > 1) return 'over';
    if (p.projectedMonthly > p.cap) return 'behind';
    return 'on-pace';
  }
  if (p.fraction >= 1) return 'hit';
  if (p.monthlyVelocity <= 0) return 'behind';
  if (goal.targetDate && p.projectedDate && p.projectedDate > goal.targetDate) {
    return 'behind';
  }
  return 'on-pace';
}

const BUCKET_OVER = 100;
const BUCKET_PROJECTED = 50;
const BUCKET_LATE = 25;
const BUCKET_DORMANT = 20;
const MONTH_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Higher = more urgent. Bucketed so over-cap always outranks projected-over,
 * which always outranks late-ETA savings, which always outranks dormant
 * savings. On-pace returns 0; hit returns -1. Within-bucket ordering uses
 * the breach magnitude (capped to keep extremes from dominating).
 */
export function severityKey(goal: GoalWithProgress): number {
  const v = paceVerdict(goal);
  const p = goal.progress;
  if (p.type === 'spend_cap') {
    if (v === 'over') {
      const ratio = p.cap > 0 ? (p.spent - p.cap) / p.cap : 0;
      return BUCKET_OVER + Math.min(ratio, 10);
    }
    if (v === 'behind') {
      const ratio = p.cap > 0 ? (p.projectedMonthly - p.cap) / p.cap : 0;
      return BUCKET_PROJECTED + Math.min(ratio, 10);
    }
    return 0;
  }
  if (v === 'hit') return -1;
  if (v === 'behind') {
    if (p.monthlyVelocity <= 0) return BUCKET_DORMANT;
    if (goal.targetDate && p.projectedDate) {
      const t = Date.parse(goal.targetDate);
      const proj = Date.parse(p.projectedDate);
      if (Number.isFinite(t) && Number.isFinite(proj)) {
        const monthsLate = Math.max(0, (proj - t) / MONTH_MS);
        return BUCKET_LATE + Math.min(monthsLate, 24) / 24;
      }
    }
    return BUCKET_DORMANT;
  }
  return 0;
}
