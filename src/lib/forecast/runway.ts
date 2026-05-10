/** Trailing-month history record. */
export type MonthlyTotals = { inflow: number; outflow: number };

/**
 * Runway in weeks at current burn. Returns null when:
 *   - liquidBalance ≤ 0 (no cushion to count)
 *   - History is empty (no signal)
 *   - Median monthly net (outflow - inflow) is ≤ 0 (net positive — runway
 *     is not a useful number; caller renders "Net positive" sub-text)
 *
 * Uses median over the supplied history (typically trailing 3 complete
 * months) so a single-month spike doesn't skew the burn estimate.
 *
 * Weeks = liquidBalance / medianNetMonthly × 4.33  (months-to-weeks).
 */
export function computeRunway(
  liquidBalance: number,
  history: MonthlyTotals[],
): number | null {
  if (liquidBalance <= 0) return null;
  if (history.length === 0) return null;

  const netDeltas = history
    .map((m) => m.outflow - m.inflow)
    .sort((a, b) => a - b);
  const mid = Math.floor(netDeltas.length / 2);
  const medianNet =
    netDeltas.length % 2 === 0
      ? (netDeltas[mid - 1] + netDeltas[mid]) / 2
      : netDeltas[mid];

  if (medianNet <= 0) return null;
  return (liquidBalance / medianNet) * 4.33;
}
