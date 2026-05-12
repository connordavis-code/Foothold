import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';

export type ActiveCardId = 'baseline' | 'unsaved' | string;

export function pickActiveCard(
  scenarios: Pick<Scenario, 'id' | 'name'>[],
  selectedScenarioId: string | null,
  liveOverrides: ScenarioOverrides,
): ActiveCardId {
  if (selectedScenarioId) return selectedScenarioId;
  const hasAny = Boolean(
    liveOverrides.categoryDeltas?.length ||
      liveOverrides.lumpSums?.length ||
      liveOverrides.recurringChanges?.length ||
      liveOverrides.skipRecurringInstances?.length ||
      liveOverrides.incomeDelta ||
      liveOverrides.hypotheticalGoals?.length ||
      liveOverrides.goalTargetEdits?.length,
  );
  return hasAny ? 'unsaved' : 'baseline';
}

export function formatDelta(d: number, formatCurrencyFn: (n: number) => string): string {
  return d >= 0 ? `+${formatCurrencyFn(d)}` : `${formatCurrencyFn(d)}`;
}

export function describeOverrides(o: ScenarioOverrides): string {
  const bits: string[] = [];
  if (o.incomeDelta) bits.push('income adj');
  if (o.lumpSums?.length) bits.push(`${o.lumpSums.length} lump sum${o.lumpSums.length === 1 ? '' : 's'}`);
  if (o.recurringChanges?.length) bits.push(`${o.recurringChanges.length} recurring change${o.recurringChanges.length === 1 ? '' : 's'}`);
  if (o.categoryDeltas?.length) bits.push(`${o.categoryDeltas.length} category adj`);
  if (o.hypotheticalGoals?.length) bits.push(`${o.hypotheticalGoals.length} hypothetical goal${o.hypotheticalGoals.length === 1 ? '' : 's'}`);
  if (o.goalTargetEdits?.length) bits.push(`${o.goalTargetEdits.length} goal edit`);
  if (bits.length === 0) return 'no overrides';
  return bits.join(' · ');
}
