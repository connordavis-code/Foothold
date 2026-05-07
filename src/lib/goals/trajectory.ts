export type TrajectoryPoint = {
  /** YYYY-MM-DD */
  date: string;
  cumulative: number;
};

export type WalkBackInput = {
  /** Today's running value (e.g., sum of currentBalance for the goal's accounts). */
  anchor: number;
  /** Per-day net delta from transactions, keyed YYYY-MM-DD. Positive=outflow. */
  dailyDelta: ReadonlyMap<string, number>;
  /** Reference date — series ends here. */
  today: Date;
  /** Window length, inclusive. days=1 yields just today. */
  days: number;
};

/**
 * Walks backward day-by-day from `anchor` (today's value) by re-adding each
 * day's outflows and removing inflows. Returns oldest→newest.
 *
 * Same shape as the inline walk-back in `getNetWorthSparkline` post-W-06; pure
 * so the chart math is testable without a DB or Next runtime.
 *
 * Convention matches the rest of the codebase: transaction.amount > 0 means
 * money OUT, < 0 means money IN. So walking backward, we ADD positive amounts
 * back to the running total.
 *
 * `today`'s delta is assumed to already be folded into `anchor` — it is only
 * re-applied when walking into yesterday. `dailyDelta` keys are UTC dates.
 */
export function walkBackTrajectory(
  input: WalkBackInput,
): TrajectoryPoint[] {
  const { anchor, dailyDelta, today, days } = input;
  const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);
  const series: TrajectoryPoint[] = [];
  let running = anchor;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = yyyymmdd(d);
    series.push({ date: key, cumulative: running });
    running += dailyDelta.get(key) ?? 0;
  }
  return series.reverse();
}
