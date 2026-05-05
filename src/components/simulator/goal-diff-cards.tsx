import { formatCurrency } from '@/lib/utils';
import type {
  ForecastHistory,
  GoalImpact,
  ScenarioOverrides,
} from '@/lib/forecast/types';

type Props = {
  goalImpacts: GoalImpact[];
  history: ForecastHistory;
  hypotheticalGoals?: ScenarioOverrides['hypotheticalGoals'];
  /** YYYY-MM — used to compute "X mo from now" subtitle. */
  currentMonth: string;
};

type GoalContext = {
  targetAmount: number;
  monthlyContribution: number;
  currentSaved: number;
  isHypo: boolean;
};

function shiftPill(impact: GoalImpact): { text: string; tone: 'sooner' | 'later' | 'same' | 'hypo' | 'unreachable' } | null {
  if (impact.baselineETA === null && impact.scenarioETA === null) {
    return { text: 'unreachable', tone: 'unreachable' };
  }
  if (impact.baselineETA === null) {
    return { text: 'hypo', tone: 'hypo' };
  }
  if (impact.shiftMonths < 0) {
    return { text: `↓ ${Math.abs(impact.shiftMonths)} mo`, tone: 'sooner' };
  }
  if (impact.shiftMonths > 0) {
    return { text: `↑ ${impact.shiftMonths} mo`, tone: 'later' };
  }
  return { text: 'same', tone: 'same' };
}

const toneStyles: Record<string, string> = {
  sooner: 'bg-positive/10 text-positive',
  later: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  same: 'bg-muted text-muted-foreground',
  hypo: 'bg-accent text-foreground/80',
  unreachable: 'bg-muted text-muted-foreground/70',
};

function diffMonths(target: string, current: string): number {
  const [ty, tm] = target.split('-').map(Number);
  const [cy, cm] = current.split('-').map(Number);
  return (ty - cy) * 12 + (tm - cm);
}

function findContext(
  impact: GoalImpact,
  history: ForecastHistory,
  hypoGoals: ScenarioOverrides['hypotheticalGoals'],
): GoalContext | null {
  // Engine encodes hypothetical goal ids as "hypo:<uuid>" — see goal-projection.ts.
  if (impact.goalId.startsWith('hypo:')) {
    const baseId = impact.goalId.slice('hypo:'.length);
    const hypo = hypoGoals?.find((g) => g.id === baseId);
    if (!hypo) return null;
    return {
      targetAmount: hypo.targetAmount,
      monthlyContribution: hypo.monthlyContribution ?? 0,
      currentSaved: 0,
      isHypo: true,
    };
  }
  const real = history.goals.find((g) => g.id === impact.goalId);
  if (!real) return null;
  return {
    targetAmount: real.targetAmount,
    monthlyContribution: real.monthlyContribution ?? 0,
    currentSaved: real.currentSaved,
    isHypo: false,
  };
}

export function GoalDiffCards({
  goalImpacts,
  history,
  hypotheticalGoals,
  currentMonth,
}: Props) {
  if (goalImpacts.length === 0) {
    return (
      <section className="space-y-3">
        <p className="text-eyebrow">Goals impact</p>
        <p className="text-sm italic text-muted-foreground">
          No goals yet. Add real goals from /goals or hypothetical goals on the left.
        </p>
      </section>
    );
  }

  // Single card looks lonely in a 2-col grid; let it expand.
  const gridCols =
    goalImpacts.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <section className="space-y-3">
      <p className="text-eyebrow">Goals impact</p>
      <div className={`grid gap-3 ${gridCols}`}>
        {goalImpacts.map((g) => {
          const pill = shiftPill(g);
          const ctx = findContext(g, history, hypotheticalGoals);
          const monthsOut = g.scenarioETA
            ? diffMonths(g.scenarioETA, currentMonth)
            : null;
          const progressPct =
            ctx && !ctx.isHypo && ctx.targetAmount > 0
              ? Math.min(
                  100,
                  Math.round((ctx.currentSaved / ctx.targetAmount) * 100),
                )
              : null;

          return (
            <article
              key={g.goalId}
              className="rounded-card border border-border bg-surface-elevated p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-foreground">{g.name}</div>
                {pill && (
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-wide ${toneStyles[pill.tone]}`}
                  >
                    {pill.text}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
                  {g.scenarioETA ?? '—'}
                </div>
                {monthsOut !== null && monthsOut >= 0 && (
                  <div className="text-xs text-muted-foreground">
                    {monthsOut === 0 ? 'this month' : `${monthsOut} mo from now`}
                  </div>
                )}
              </div>

              {g.baselineETA && g.baselineETA !== g.scenarioETA && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  was {g.baselineETA}
                </div>
              )}

              {ctx && (
                <div className="mt-3 space-y-1 border-t border-border pt-3">
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>
                      {formatCurrency(ctx.targetAmount, { compact: true })} target
                      {ctx.monthlyContribution > 0 &&
                        ` · ${formatCurrency(ctx.monthlyContribution, { compact: true })}/mo`}
                    </span>
                    {!ctx.isHypo && progressPct !== null && (
                      <span className="font-medium text-foreground/80">
                        {progressPct}%
                      </span>
                    )}
                  </div>
                  {!ctx.isHypo && progressPct !== null && (
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-foreground/70"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
