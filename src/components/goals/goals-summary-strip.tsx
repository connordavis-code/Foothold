import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { formatCurrencyCompact } from '@/lib/utils';

type Props = {
  activeGoals: GoalWithProgress[];
};

/**
 * 4-stat strip per prototype: Active goals · On track · Total saved ·
 * Total committed. "On track" excludes savings-behind + spend-cap-over/
 * projected-over (those count as off-track). Aggregate stats only —
 * per-goal data lives in <GoalCard>.
 */
export function GoalsSummaryStrip({ activeGoals }: Props) {
  if (activeGoals.length === 0) return null;

  const onTrackCount = activeGoals.filter((g) => {
    const p = g.progress;
    if (p.type === 'spend_cap') {
      return p.fraction <= 1 && p.projectedMonthly <= p.cap;
    }
    // savings: hit or on-pace (positive velocity, projected on/ahead of target)
    if (p.fraction >= 1) return true;
    if (p.monthlyVelocity <= 0) return false;
    if (g.targetDate && p.projectedDate && p.projectedDate > g.targetDate) {
      return false;
    }
    return true;
  }).length;

  const totalSaved = activeGoals.reduce((sum, g) => {
    return sum + (g.progress.type === 'savings' ? g.progress.current : g.progress.spent);
  }, 0);

  const totalCommitted = activeGoals.reduce((sum, g) => {
    return sum + (g.progress.type === 'savings' ? g.progress.target : g.progress.cap);
  }, 0);

  return (
    <div className="grid grid-cols-2 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-4">
      <Stat label="Active goals" value={String(activeGoals.length)} />
      <Stat label="On track" value={`${onTrackCount}/${activeGoals.length}`} />
      <Stat label="Total saved" value={formatCurrencyCompact(totalSaved)} />
      <Stat label="Total committed" value={formatCurrencyCompact(totalCommitted)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[--text]">
        {value}
      </div>
    </div>
  );
}
