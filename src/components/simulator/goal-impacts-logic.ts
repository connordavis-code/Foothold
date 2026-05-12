import type { GoalImpact } from '@/lib/forecast/types';

export type FormattedGoalImpact = {
  statusKey: 'faster' | 'same' | 'slower';
  arrivalLabel: string;
  baselineLabel: string;
  deltaLabel: string;
};

export function formatEra(yyyymm: string): string {
  const [y, m] = yyyymm.split('-');
  return `${y} · ${m}`;
}

export function formatGoalImpact(impact: GoalImpact): FormattedGoalImpact {
  const statusKey: FormattedGoalImpact['statusKey'] =
    impact.shiftMonths < 0 ? 'faster' : impact.shiftMonths > 0 ? 'slower' : 'same';
  const arrivalLabel =
    impact.scenarioETA === null ? 'never' : formatEra(impact.scenarioETA);
  const baselineLabel =
    impact.baselineETA === null ? 'never' : impact.baselineETA;
  const abs = Math.abs(impact.shiftMonths);
  const deltaLabel =
    impact.shiftMonths === 0
      ? 'same as baseline'
      : `${impact.shiftMonths < 0 ? '−' : '+'} ${abs} month${abs === 1 ? '' : 's'}`;
  return { statusKey, arrivalLabel, baselineLabel, deltaLabel };
}

export function sortGoalImpacts(impacts: GoalImpact[]): GoalImpact[] {
  return [...impacts].sort((a, b) => {
    const ad = Math.abs(a.shiftMonths);
    const bd = Math.abs(b.shiftMonths);
    if (ad !== bd) return bd - ad;
    return a.name.localeCompare(b.name);
  });
}
