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
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm text-[--text-2]">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: 'var(--semantic-success)',
            }}
          />
          <span>
            {hotCount} {label} running hot this week
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full bg-[--text-2] dark:bg-[--text-3]"
            />
            Typical
          </div>
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: 'var(--semantic-caution)',
              }}
            />
            Drift
          </div>
        </div>
      </header>
      <ul className="mt-4 space-y-2">
        {sorted.map((row) => {
          // Bar represents 0 → currentTotal for THIS row (no universal cap).
          // Color split shows the relationship between typical and actual:
          //   - Grey segment (0% → baselineFrac): the typical spend portion
          //   - Amber segment (baselineFrac → 100%): the drift above typical
          // For ratio 8.9× the bar is mostly amber; for ratio 1.1× mostly grey.
          // baselineFrac clamps at 1.0 so cool rows (current ≤ baseline) render
          // as full grey with no drift segment.
          const baselineFrac = Math.min(1, row.baselineWeekly / row.currentTotal);
          const baselinePct = baselineFrac * 100;
          const driftPct = (1 - baselineFrac) * 100;
          return (
            <li
              key={row.category}
              className="grid grid-cols-[180px_minmax(160px,1fr)_auto] items-center gap-3 text-xs"
            >
              <div className="truncate font-medium text-[--text]">
                {humanizeCategory(row.category)}
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                {/* Baseline segment: theme-aware — --text-2 reads with enough
                    contrast against the paper-tinted light card; --text-3 sits
                    well on the dark slate without overpowering the amber drift. */}
                <div
                  className="absolute left-0 top-0 h-full bg-[--text-2] dark:bg-[--text-3]"
                  style={{ width: `${baselinePct}%` }}
                  aria-hidden
                />
                {driftPct > 0 && (
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: `${baselinePct}%`,
                      width: `${driftPct}%`,
                      background: 'var(--semantic-caution)',
                    }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="text-right font-mono tabular-nums text-[--text-2]">
                {fmtMoney(row.currentTotal)}{' '}
                <span className="text-[--text-3]">
                  · typically {fmtMoney(row.baselineWeekly)} ({row.ratio.toFixed(1)}×)
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
