import { buildGoalMatrix, type ScenarioComparisonInput } from '@/lib/forecast/comparison';
import { cn } from '@/lib/utils';

type Props = {
  scenarios: (ScenarioComparisonInput & { colorVar: string })[];
};

/**
 * Goal-diff matrix for the compare view. Rows = goals, columns = baseline +
 * each selected scenario. Each cell shows the goal's ETA in that scenario
 * (or "—" if unreachable) and a signed shift-in-months badge vs baseline.
 *
 * Real goals appear before hypotheticals (sorted by buildGoalMatrix). A
 * scenario that doesn't define a hypothetical from another scenario shows
 * "—" — the asymmetry is the point ("Aggressive includes Travel goal,
 * Conservative doesn't").
 *
 * Mobile: horizontally scrollable. With 1 baseline + 3 scenario columns,
 * the table is ~4 columns wide; on a narrow phone the user side-scrolls
 * within the goals section without affecting the rest of the page. Each
 * goal name is sticky-left so the user always knows which row they're
 * reading.
 *
 * Server component — pure layout, no interactivity.
 */
export function GoalDiffMatrix({ scenarios }: Props) {
  if (scenarios.length === 0) return null;
  const matrix = buildGoalMatrix(scenarios);
  if (matrix.length === 0) {
    return (
      <section className="space-y-3">
        <p className="text-eyebrow">Goal impact</p>
        <p className="text-sm text-muted-foreground">
          No goals to compare. Add a goal in /goals or a hypothetical goal
          in any of these scenarios to see them shift here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-eyebrow">Goal impact</p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface-elevated">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface-elevated px-4 py-2.5 font-medium"
              >
                Goal
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Baseline
              </th>
              {scenarios.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className="px-4 py-2.5 font-medium"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: `hsl(var(${s.colorVar}))` }}
                    />
                    <span className="truncate">{s.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr
                key={row.goalId}
                className="border-b border-border last:border-b-0"
              >
                <td
                  scope="row"
                  className="sticky left-0 z-10 bg-surface-elevated px-4 py-3 font-medium text-foreground"
                >
                  {row.name}
                  {row.goalId.startsWith('hypo:') && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      hypo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-foreground">
                  {row.baseline ?? <span className="text-muted-foreground">—</span>}
                </td>
                {scenarios.map((s) => {
                  const cell = row.scenarios[s.id];
                  return (
                    <td
                      key={s.id}
                      className="px-4 py-3 font-mono tabular-nums text-foreground"
                    >
                      {cell.eta === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {cell.eta}
                          {cell.shiftMonths !== null && cell.shiftMonths !== 0 && (
                            <ShiftBadge months={cell.shiftMonths} />
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ShiftBadge({ months }: { months: number }) {
  // Negative shift = sooner = good news; positive = later = bad news.
  // Match DESIGN.md restraint: muted for sooner, amber for later.
  const isLater = months > 0;
  return (
    <span
      className={cn(
        'ml-1.5 text-[10px] font-medium tabular-nums',
        isLater ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
    >
      {months > 0 ? `+${months}` : months}mo
    </span>
  );
}
