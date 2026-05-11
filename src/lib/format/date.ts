export const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function parseIsoDateUtc(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function endOfThisWeekUtc(today: Date): Date {
  // Week ends Sunday. JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat.
  // If today is Sunday, end-of-week IS today.
  const dow = today.getUTCDay();
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  const eow = new Date(today);
  eow.setUTCDate(today.getUTCDate() + daysUntilSunday);
  return eow;
}

export function endOfCurrentMonthUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
}

export function endOfNextMonthUtc(today: Date): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 0));
}

/** First/last day of the current local calendar month as YYYY-MM-DD strings. */
export function currentMonthRange(now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    daysInMonth: Math.round((end.getTime() - start.getTime()) / DAY_MS),
    dayOfMonth: now.getDate(),
  };
}

/**
 * Humanize a YYYY-MM-DD calendar date for mobile section headers.
 *
 * Today / Yesterday for the two recent days; weekday-prefixed within
 * the past 7; otherwise "MMM d" (or "MMM d, yyyy" if outside the
 * current calendar year). Computed in UTC so a YYYY-MM-DD value
 * doesn't drift by a day in non-UTC client locales.
 *
 * `now` is injectable for deterministic tests; defaults to Date.now().
 */
export function humanizeDate(
  yyyymmdd: string,
  now: Date = new Date(),
): string {
  const target = parseIsoDateUtc(yyyymmdd);
  if (Number.isNaN(target.getTime())) return yyyymmdd;

  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const targetUtc = target.getTime();
  const dayDelta = Math.round((todayUtc - targetUtc) / 86_400_000);

  if (dayDelta === 0) return 'Today';
  if (dayDelta === 1) return 'Yesterday';

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    target.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

  if (dayDelta > 1 && dayDelta < 7) {
    return fmt({ weekday: 'short', month: 'short', day: 'numeric' });
  }

  const sameYear = target.getUTCFullYear() === now.getUTCFullYear();
  return fmt(
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

/**
 * "5m ago" / "2h ago" / "yesterday" / locale date for older.
 *
 * Promoted from `src/app/(app)/settings/page.tsx` so settings, sync-pill,
 * source health rows, and the dashboard "as of" annotations all read
 * from one source of truth. `now` is injectable for deterministic tests.
 */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - d.getTime();
  // Future dates (clock skew) read as "just now" rather than negative.
  if (diffMs < 0) return 'just now';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
