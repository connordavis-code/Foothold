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

// Plaid recurring cadence → monthly equivalent multipliers.
// Weekly: 52 weeks / 12 months ≈ 4.333
// Biweekly: 26 pay periods / 12 months ≈ 2.167
const WEEKS_PER_MONTH = 4.333;
const BIWEEKS_PER_MONTH = 2.167;

/**
 * Compute the baseline projection (no overrides applied).
 *
 * For each future month within the horizon:
 *   - recurring streams projected as-known (monthly cadence assumed for v1;
 *     weekly/biweekly approximated as 4.333×/2.167× monthly equivalent)
 *   - non-recurring outflows per category = trailing median
 *   - non-recurring income = trailing median
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
  const incomeBaseline = median(history.nonRecurringIncomeHistory);

  // Pre-compute recurring totals per direction.
  let recurringMonthlyOutflow = 0;
  let recurringMonthlyInflow = 0;
  for (const stream of history.recurringStreams) {
    const monthlyEquivalent =
      stream.cadence === 'weekly'
        ? stream.amount * WEEKS_PER_MONTH
        : stream.cadence === 'biweekly'
          ? stream.amount * BIWEEKS_PER_MONTH
          : stream.amount;
    if (stream.direction === 'outflow') recurringMonthlyOutflow += monthlyEquivalent;
    else recurringMonthlyInflow += monthlyEquivalent;
  }

  const projection: MonthlyProjection[] = [];
  let runningCash = history.currentCash;

  for (let i = 0; i < horizonMonths; i++) {
    const month = addMonths(currentMonth, i + 1); // skip current month; project forward
    const startCash = runningCash;

    const inflows = recurringMonthlyInflow + incomeBaseline;
    const outflows =
      recurringMonthlyOutflow +
      Object.values(categoryBaseline).reduce((s, v) => s + v, 0);
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
