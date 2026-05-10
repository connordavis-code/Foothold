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
  const target = new Date(`${yyyymmdd}T00:00:00Z`);
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
