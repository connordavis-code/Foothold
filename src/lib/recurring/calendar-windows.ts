import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import {
  endOfCurrentMonthUtc,
  endOfNextMonthUtc,
  endOfThisWeekUtc,
  parseIsoDateUtc,
  startOfUtcDay,
} from '@/lib/format/date';

export type CalendarBuckets = {
  thisWeek: RecurringStreamRow[];
  laterThisMonth: RecurringStreamRow[];
  nextMonth: RecurringStreamRow[];
  beyond: RecurringStreamRow[];
};

export type Trend = 'up' | 'down' | 'flat';

/**
 * Bucket active outflow streams by predictedNextDate relative to today.
 * Boundary semantics (UTC):
 *   - thisWeek: [today, end-of-this-Sunday] (inclusive both ends)
 *   - laterThisMonth: [next-Monday, last-day-of-current-month]
 *   - nextMonth: entire next calendar month, inclusive both ends
 *   - beyond: anything later (typically annual fees)
 *   - dropped: predictedNextDate === null OR date < today
 *
 * Sort within each bucket: predictedNextDate ascending.
 */
export function groupByDateWindow(
  streams: RecurringStreamRow[],
  today: Date,
): CalendarBuckets {
  const todayUtc = startOfUtcDay(today);
  const sundayThisWeek = endOfThisWeekUtc(todayUtc);
  const lastDayOfCurrentMonth = endOfCurrentMonthUtc(todayUtc);
  const lastDayOfNextMonth = endOfNextMonthUtc(todayUtc);

  const buckets: CalendarBuckets = {
    thisWeek: [],
    laterThisMonth: [],
    nextMonth: [],
    beyond: [],
  };

  for (const s of streams) {
    if (!s.predictedNextDate) continue;
    const d = parseIsoDateUtc(s.predictedNextDate);
    if (d < todayUtc) continue;

    if (d <= sundayThisWeek) {
      buckets.thisWeek.push(s);
    } else if (d <= lastDayOfCurrentMonth) {
      buckets.laterThisMonth.push(s);
    } else if (d <= lastDayOfNextMonth) {
      buckets.nextMonth.push(s);
    } else {
      buckets.beyond.push(s);
    }
  }

  const byDateAsc = (a: RecurringStreamRow, b: RecurringStreamRow) =>
    (a.predictedNextDate ?? '').localeCompare(b.predictedNextDate ?? '');
  buckets.thisWeek.sort(byDateAsc);
  buckets.laterThisMonth.sort(byDateAsc);
  buckets.nextMonth.sort(byDateAsc);
  buckets.beyond.sort(byDateAsc);

  return buckets;
}

/**
 * Returns the earliest-dated non-past, non-null stream. Used for the
 * "Next charge" KPI cell.
 */
export function pickNextCharge(
  streams: RecurringStreamRow[],
  today: Date,
): { stream: RecurringStreamRow; dateIso: string } | null {
  const todayUtc = startOfUtcDay(today);
  let best: { stream: RecurringStreamRow; dateIso: string } | null = null;
  for (const s of streams) {
    if (!s.predictedNextDate) continue;
    const d = parseIsoDateUtc(s.predictedNextDate);
    if (d < todayUtc) continue;
    if (!best || s.predictedNextDate < best.dateIso) {
      best = { stream: s, dateIso: s.predictedNextDate };
    }
  }
  return best;
}

/**
 * Direction of the most recent charge vs the rolling average.
 * ±5% threshold; either-null returns flat.
 */
export function trendIndicator(stream: RecurringStreamRow): Trend {
  const last = stream.lastAmount == null ? null : Number(stream.lastAmount);
  const avg = stream.averageAmount == null ? null : Number(stream.averageAmount);
  if (last == null || avg == null || !Number.isFinite(last) || !Number.isFinite(avg)) {
    return 'flat';
  }
  if (avg === 0) return 'flat';
  if (last > avg * 1.05) return 'up';
  if (last < avg * 0.95) return 'down';
  return 'flat';
}
