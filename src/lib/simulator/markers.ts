import type { MonthlyProjection, GoalImpact } from '@/lib/forecast/types';
import type { RangeParam } from './url-state';

export type ChartMarker =
  | { kind: 'runwayDepleted'; monthIndex: number }
  | { kind: 'goalArrival'; monthIndex: number; goalName: string };

const RANGE_TO_MONTHS: Record<RangeParam, number> = { '1Y': 12, '2Y': 24 };
const GOAL_ARRIVAL_CAP = 3;

/**
 * Builds the markers rendered on `<ForecastChart>`. Two kinds:
 *   - runwayDepleted: first baseline-projection month where endCash crosses
 *     below zero. Anchored to baseline (not scenario) so the marker reads
 *     as "what you're escaping" not "what you're now headed toward".
 *   - goalArrival: one per goal whose scenarioETA falls inside the visible
 *     window. Capped at 3 to keep the chart legible.
 *
 * `currentMonth` is the leftmost x-axis position. monthIndex = months
 * elapsed since currentMonth.
 */
export function deriveChartMarkers(
  baseline: MonthlyProjection[],
  _scenario: MonthlyProjection[], // reserved for future scenario-specific markers
  goalImpacts: GoalImpact[],
  currentMonth: string,
  range: RangeParam,
): ChartMarker[] {
  if (baseline.length === 0) return [];

  const horizonMonths = RANGE_TO_MONTHS[range];
  const visibleBaseline = baseline.slice(0, horizonMonths);

  const markers: ChartMarker[] = [];

  // Runway depleted: first month endCash < 0 in visible baseline
  const depletedIndex = visibleBaseline.findIndex((m) => m.endCash < 0);
  if (depletedIndex !== -1) {
    markers.push({ kind: 'runwayDepleted', monthIndex: depletedIndex });
  }

  // Goal arrivals: scenarioETA must exist + fall within visible range
  const arrivals = goalImpacts
    .filter((g) => g.scenarioETA !== null)
    .map((g) => ({
      goal: g,
      monthIndex: monthDiff(currentMonth, g.scenarioETA!),
    }))
    .filter(({ monthIndex }) => monthIndex >= 0 && monthIndex < horizonMonths)
    .sort((a, b) => a.monthIndex - b.monthIndex)
    .slice(0, GOAL_ARRIVAL_CAP);

  for (const { goal, monthIndex } of arrivals) {
    markers.push({ kind: 'goalArrival', monthIndex, goalName: goal.name });
  }

  return markers.sort((a, b) => a.monthIndex - b.monthIndex);
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
