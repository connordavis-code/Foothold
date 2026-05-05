import { describe, expect, it } from 'vitest';
import type { InsightSupplements } from './types';
import { getVisibleTiles, tileGridIsSingleColumn } from './tile-visibility';

function baseSupplements(
  overrides: Partial<InsightSupplements> = {},
): InsightSupplements {
  return {
    spending: { totalThisWeek: 0, deltaVsBaseline: null, topCategories: [] },
    drift: { elevated: [], hasBaseline: false },
    goals: { activeCount: 0, onPaceCount: 0, notable: [] },
    recurring: { hitThisWeekCount: 0, hitThisWeekTotal: 0, monthlyTotal: 0 },
    ...overrides,
  };
}

describe('getVisibleTiles', () => {
  it('always renders spending', () => {
    expect(getVisibleTiles(baseSupplements()).spending).toBe(true);
  });

  it('hides drift when baseline is sparse', () => {
    const v = getVisibleTiles(
      baseSupplements({
        drift: {
          hasBaseline: false,
          elevated: [
            { category: 'FOOD', ratio: 2, currentTotal: 100, baselineWeekly: 50 },
          ],
        },
      }),
    );
    expect(v.drift).toBe(false);
  });

  it('hides drift when elevated list is empty even with a baseline', () => {
    const v = getVisibleTiles(
      baseSupplements({ drift: { hasBaseline: true, elevated: [] } }),
    );
    expect(v.drift).toBe(false);
  });

  it('shows drift when baseline exists and at least one category is elevated', () => {
    const v = getVisibleTiles(
      baseSupplements({
        drift: {
          hasBaseline: true,
          elevated: [
            { category: 'FOOD', ratio: 2, currentTotal: 100, baselineWeekly: 50 },
          ],
        },
      }),
    );
    expect(v.drift).toBe(true);
  });

  it('shows goals iff activeCount > 0', () => {
    expect(getVisibleTiles(baseSupplements()).goals).toBe(false);
    const withGoals = getVisibleTiles(
      baseSupplements({
        goals: { activeCount: 2, onPaceCount: 1, notable: [] },
      }),
    );
    expect(withGoals.goals).toBe(true);
  });

  it('shows recurring iff monthlyTotal > 0', () => {
    expect(getVisibleTiles(baseSupplements()).recurring).toBe(false);
    const withRecurring = getVisibleTiles(
      baseSupplements({
        recurring: { hitThisWeekCount: 0, hitThisWeekTotal: 0, monthlyTotal: 25 },
      }),
    );
    expect(withRecurring.recurring).toBe(true);
  });

  it('reports single-column when only spending is visible', () => {
    const v = getVisibleTiles(baseSupplements());
    expect(tileGridIsSingleColumn(v)).toBe(true);
  });

  it('reports multi-column when any other tile is visible', () => {
    const v = getVisibleTiles(
      baseSupplements({
        goals: { activeCount: 1, onPaceCount: 1, notable: [] },
      }),
    );
    expect(tileGridIsSingleColumn(v)).toBe(false);
  });
});
