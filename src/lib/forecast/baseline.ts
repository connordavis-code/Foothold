import type { ForecastHistory, MonthlyProjection } from './types';

/**
 * Outlier-robust central tendency. Empty array → 0.
 * One $800 vet bill in a 3-month window of [200, 800, 200] should not make
 * the projection think Veterinary is a $400/mo recurring spend. Median ignores it.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute the baseline projection (no overrides applied).
 *
 * Architecture B (closes review C-01): the baseline reads RAW PFC totals from
 * categoryHistory and RAW income from incomeHistory. Recurring streams flow
 * through `history.recurringStreams` for override appliers (pause/edit/skip)
 * but are NOT separately added here — Plaid already classifies recurring
 * transactions under their PFC, so summing PFC categories gives the full
 * monthly outflow without double-counting. Spec:
 * docs/superpowers/specs/2026-05-05-c01-forecast-recurring-subtraction-design.md
 *
 * For each future month within the horizon:
 *   - per-category outflows = median of trailing monthly PFC totals
 *   - inflows = median of trailing monthly income totals
 *
 * @param history input snapshot from getForecastHistory
 * @param currentMonth YYYY-MM — engine never reads Date.now()
 * @param horizonMonths number of months ahead to project
 */
export function computeBaseline(
  history: ForecastHistory,
  currentMonth: string,
  horizonMonths: number,
): MonthlyProjection[] {
  // Pre-compute per-category and income medians (constant across months).
  const categoryBaseline: Record<string, number> = {};
  for (const [categoryId, monthly] of Object.entries(history.categoryHistory)) {
    categoryBaseline[categoryId] = median(monthly);
  }
  const incomeBaseline = median(history.incomeHistory);

  const projection: MonthlyProjection[] = [];
  let runningCash = history.currentCash;

  for (let i = 0; i < horizonMonths; i++) {
    const month = addMonths(currentMonth, i + 1); // skip current month; project forward
    const startCash = runningCash;

    const inflows = incomeBaseline;
    const outflows = Object.values(categoryBaseline).reduce((s, v) => s + v, 0);
    const endCash = startCash + inflows - outflows;

    projection.push({
      month,
      startCash,
      inflows,
      outflows,
      endCash,
      byCategory: { ...categoryBaseline },
      goalProgress: {}, // populated by goal-projection step (Task 9)
    });

    runningCash = endCash;
  }

  return projection;
}

/** Add `n` months to a YYYY-MM string. Pure. */
export function addMonths(month: string, n: number): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}
