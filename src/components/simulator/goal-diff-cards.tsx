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
  sooner: 'bg-sky-50 text-sky-700',
  later: 'bg-amber-50 text-amber-700',
  same: 'bg-muted text-muted-foreground',
  hypo: 'bg-amber-50 text-amber-700',
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
      <section>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Goals impact
        </div>
        <p className="text-sm text-muted-foreground italic">
          No goals yet. Add real goals from /goals or hypothetical goals on the left.
        </p>
      </section>
    );
  }

  // Single card looks lonely in a 2-col grid; let it expand.
  const gridCols = goalImpacts.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Goals impact
      </div>
      <div className={`grid gap-3 ${gridCols}`}>
        {goalImpacts.map((g) => {
          const pill = shiftPill(g);
          const ctx = findContext(g, history, hypotheticalGoals);
          const monthsOut = g.scenarioETA ? diffMonths(g.scenarioETA, currentMonth) : null;
          const progressPct =
            ctx && !ctx.isHypo && ctx.targetAmount > 0
              ? Math.min(100, Math.round((ctx.currentSaved / ctx.targetAmount) * 100))
              : null;

          return (
            <article
              key={g.goalId}
              className="bg-muted/40 border border-border/60 rounded-lg p-3.5"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-sm text-foreground font-medium">{g.name}</div>
                {pill && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${toneStyles[pill.tone]}`}
                  >
                    {pill.text}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <div className="text-lg font-semibold text-foreground">
                  {g.scenarioETA ?? '—'}
                </div>
                {monthsOut !== null && monthsOut >= 0 && (
                  <div className="text-xs text-muted-foreground">
                    {monthsOut === 0 ? 'this month' : `${monthsOut} mo from now`}
                  </div>
                )}
              </div>

              {g.baselineETA && g.baselineETA !== g.scenarioETA && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  was {g.baselineETA}
                </div>
              )}

              {ctx && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>
                      {formatCurrency(ctx.targetAmount, { compact: true })} target
                      {ctx.monthlyContribution > 0 &&
                        ` · ${formatCurrency(ctx.monthlyContribution, { compact: true })}/mo`}
                    </span>
                    {!ctx.isHypo && progressPct !== null && (
                      <span className="text-foreground/80 font-medium">{progressPct}%</span>
                    )}
                  </div>
                  {!ctx.isHypo && progressPct !== null && (
                    <div className="h-1 bg-border/60 rounded-full overflow-hidden">
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
