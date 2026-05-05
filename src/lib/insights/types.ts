import type { GoalType } from '@/lib/db/queries/goals';

/**
 * Structured numbers that back the /insights "What Claude saw" section.
 * Built by getInsightSupplements() at request time (no persistence —
 * see spec Approach 1: live recompute for past weeks is acceptable).
 *
 * Each sub-object carries enough data for its tile to render PLUS the
 * predicate fields (`hasBaseline`, `activeCount`, etc.) that the
 * tile-visibility module reads.
 */
export type InsightSupplements = {
  spending: {
    totalThisWeek: number;
    /** (totalThisWeek) - (median weekly across the prior 4 weeks). null if no baseline. */
    deltaVsBaseline: number | null;
    /** Top 3 by total. */
    topCategories: { category: string; total: number }[];
  };
  drift: {
    elevated: {
      category: string;
      ratio: number;
      currentTotal: number;
      baselineWeekly: number;
    }[];
    /** False if user has <4 weeks of any spend → flagging is meaningless. */
    hasBaseline: boolean;
  };
  goals: {
    activeCount: number;
    onPaceCount: number;
    /** Up to 2 goals worst-pace-first; empty when activeCount === 0. */
    notable: { name: string; pacePct: number; type: GoalType }[];
  };
  recurring: {
    hitThisWeekCount: number;
    hitThisWeekTotal: number;
    monthlyTotal: number;
  };
};
