import type { GoalImpact } from '@/lib/forecast/types';

type Props = {
  goalImpacts: GoalImpact[];
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

export function GoalDiffCards({ goalImpacts }: Props) {
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

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
        Goals impact
      </div>
      <div className="grid grid-cols-2 gap-3">
        {goalImpacts.map((g) => {
          const pill = shiftPill(g);
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
              <div className="text-lg font-semibold text-foreground">
                {g.scenarioETA ?? '—'}
              </div>
              {g.baselineETA && g.baselineETA !== g.scenarioETA && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  was {g.baselineETA}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
