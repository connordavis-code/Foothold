import { humanizeCategory } from '@/lib/format/category';
import type { DriftFlag } from '@/lib/db/queries/drift';

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`;

type Props = {
  elevated: DriftFlag[];
};

/**
 * Inline drift leaderboard, folded from /drift route. Renders null when
 * no categories are currently elevated. Per locked decision R.0 #3, row
 * drilldowns to /transactions filtered by category are dropped — the
 * module surfaces information only.
 */
export function DriftModule({ elevated }: Props) {
  if (elevated.length === 0) return null;

  // Drift query already sorts currentlyElevated by ratio desc; ratio > 1 is
  // the "hot" threshold per drift IA rework convention.
  const sorted = elevated;
  const hotCount = sorted.filter((r) => r.ratio > 1).length;
  const label = hotCount === 1 ? 'category' : 'categories';

  return (
    <section id="drift" className="rounded-card bg-[--surface] p-5">
      <header className="flex items-center gap-2 text-sm text-[--text-2]">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[--accent]"
          aria-hidden
        />
        <span>
          {hotCount} {label} running hot this week
        </span>
      </header>
      <ul className="mt-4 space-y-2">
        {sorted.map((row) => {
          const isHot = row.ratio > 1;
          // Bar fill clamped to prevent 10×+ ratios blowing the bar width.
          const widthPct = Math.min(row.ratio * 10, 100);
          return (
            <li
              key={row.category}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs"
            >
              <div className="font-medium text-[--text]">
                {humanizeCategory(row.category)}
              </div>
              <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-[--surface-2]">
                {/* Baseline tick at fixed left offset per prototype */}
                <div
                  className="absolute top-0 h-full w-px bg-[--text-3]"
                  style={{ left: '14%' }}
                  aria-hidden
                />
                <div
                  className={
                    isHot
                      ? 'h-full rounded-full bg-[--accent]'
                      : 'h-full rounded-full bg-[--text-3]'
                  }
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="font-mono tabular-nums text-[--text-2]">
                {fmtMoney(row.currentTotal)}{' '}
                <span className="text-[--text-3]">
                  · {fmtMoney(row.baselineWeekly)} ({row.ratio.toFixed(1)}×)
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
