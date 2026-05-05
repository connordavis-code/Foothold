import type { InsightSupplements } from './types';

export type VisibleTiles = {
  spending: true;
  drift: boolean;
  goals: boolean;
  recurring: boolean;
};

/**
 * Decide which receipt tiles should render. Spending always shows
 * (anchor metric). Other tiles gate on having data worth showing,
 * mirroring the LLM prompt's "skip empty areas" rule.
 */
export function getVisibleTiles(s: InsightSupplements): VisibleTiles {
  return {
    spending: true,
    drift: s.drift.hasBaseline && s.drift.elevated.length > 0,
    goals: s.goals.activeCount > 0,
    recurring: s.recurring.monthlyTotal > 0,
  };
}

/** True when only the always-on Spending tile is visible. */
export function tileGridIsSingleColumn(v: VisibleTiles): boolean {
  return !v.drift && !v.goals && !v.recurring;
}
