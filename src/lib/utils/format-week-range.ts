type FormatOptions = {
  /** Append the year to the end date. Default: true. Set false for compact contexts. */
  includeYear?: boolean;
};

/**
 * Format a YYYY-MM-DD week range as "Mon D – Mon D[, YYYY]".
 *
 * Both endpoints are anchored at UTC midnight and rendered with
 * `timeZone: 'UTC'` so calendar-date strings don't shift based on the
 * renderer's locale (the off-by-one-day bug for west-of-UTC users when
 * naive `new Date('YYYY-MM-DD')` is rendered without a timezone hint).
 */
export function formatWeekRange(
  start: string,
  end: string,
  { includeYear = true }: FormatOptions = {},
): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const left = s.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const right = e.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
  return `${left} – ${right}`;
}
