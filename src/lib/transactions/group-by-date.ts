import type { TransactionListRow } from '@/lib/db/queries/transactions';

export type DayGroup<Row = TransactionListRow> = {
  /** ISO date string `YYYY-MM-DD`. */
  dateIso: string;
  /** Abbreviated weekday name (`Sun`–`Sat`), UTC-anchored. */
  dayName: string;
  /** Signed sum of `row.amount` within the group (Plaid: +out, -in). */
  dayNet: number;
  rows: Row[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Bucket transactions by ISO date (YYYY-MM-DD). Output is sorted by
 * date descending (newest first); within a group rows preserve input
 * order — callers handle within-day sort.
 *
 * Generic in the row shape so investment txns / future grouped tables
 * can reuse; the grouper only touches `date` + `amount`.
 *
 * dayName is UTC-anchored to dodge timezone drift on the boundary
 * (a 2026-05-11 ISO date parsed as local time in a negative-offset
 * zone otherwise renders as 2026-05-10's weekday).
 *
 * dayNet keeps Plaid sign convention (positive = outflow). Display
 * layer flips for rendering, same as row-level amounts.
 */
export function groupTransactionsByDate<
  Row extends { date: string; amount: number },
>(rows: Row[]): DayGroup<Row>[] {
  const byDate = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date);
    if (bucket) bucket.push(row);
    else byDate.set(row.date, [row]);
  }

  const groups: DayGroup<Row>[] = [];
  for (const [dateIso, groupRows] of byDate) {
    const dayNet = groupRows.reduce((sum, r) => sum + r.amount, 0);
    groups.push({
      dateIso,
      dayName: weekdayFromIso(dateIso),
      dayNet,
      rows: groupRows,
    });
  }

  groups.sort((a, b) =>
    a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0,
  );
  return groups;
}

function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[utcDay];
}
