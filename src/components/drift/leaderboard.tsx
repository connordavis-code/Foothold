import type { LeaderboardRow } from '@/lib/db/queries/drift';
import { humanizeCategory } from '@/lib/format/category';
import { cn, formatCurrency } from '@/lib/utils';

type Props = {
  rows: LeaderboardRow[];
};

/**
 * Bar leaderboard for /drift. Each row renders the cat's current-
 * week spend as a horizontal bar with a tick mark for the 4-week
 * baseline median; the right side carries the dollar comparison and
 * ratio. Sort + cap come from `buildLeaderboard` upstream.
 *
 * Visual encoding follows the editorial register:
 *  - Single foreground hue for normal rows (no rainbow legend)
 *  - Amber fill for `isElevated` rows (matches the established
 *    elevated-state hue on <ElevatedTile> + <DriftFlagsCard>)
 *  - Bar scale shared across rows AND types: max of all currents AND
 *    all baselines, so the baseline tick stays on-screen even when a
 *    category's baseline dwarfs its current spend
 */
export function Leaderboard({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing material this week.
      </p>
    );
  }

  const scale = rows.reduce(
    (m, r) => Math.max(m, r.currentTotal, r.baselineWeekly),
    0,
  );

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <LeaderboardRowItem key={row.category} row={row} scale={scale} />
      ))}
    </ul>
  );
}

function LeaderboardRowItem({
  row,
  scale,
}: {
  row: LeaderboardRow;
  scale: number;
}) {
  const currentPct = scale > 0 ? (row.currentTotal / scale) * 100 : 0;
  const baselinePct = scale > 0 ? (row.baselineWeekly / scale) * 100 : 0;

  return (
    <li className="grid grid-cols-[140px_1fr_200px] items-center gap-3 sm:grid-cols-[160px_1fr_220px]">
      <p className="truncate text-sm font-medium" title={humanizeCategory(row.category)}>
        {humanizeCategory(row.category)}
      </p>

      <div className="relative h-2.5 rounded-pill bg-muted">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-pill transition-[width] duration-fast ease-out-quart',
            row.isElevated
              ? 'bg-amber-500/80 dark:bg-amber-400/70'
              : 'bg-foreground/70',
          )}
          style={{ width: `${currentPct}%` }}
          aria-hidden
        />
        <div
          className="absolute -top-0.5 h-3.5 w-px bg-muted-foreground/70"
          style={{ left: `${baselinePct}%` }}
          aria-hidden
          title={`Baseline ${formatCurrency(row.baselineWeekly)}`}
        />
      </div>

      <div className="flex items-baseline justify-end gap-3 text-right">
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatCurrency(row.currentTotal)}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          vs {formatCurrency(row.baselineWeekly)}
        </span>
        <span
          className={cn(
            'min-w-[44px] font-mono text-sm tabular-nums',
            row.isElevated
              ? 'font-semibold text-amber-700 dark:text-amber-300'
              : 'text-foreground/80',
          )}
        >
          {row.ratio.toFixed(1)}×
        </span>
      </div>
    </li>
  );
}
