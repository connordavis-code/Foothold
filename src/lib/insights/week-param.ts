const WEEK_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the shape of a `?week` searchParam from /insights.
 * Returns the date string if it's a well-formed, real, non-future
 * YYYY-MM-DD; otherwise null.
 *
 * Existence-against-DB is NOT this module's concern — the page passes
 * the result to getInsightForWeek() and falls back to latest if that
 * returns null.
 */
export function resolveWeekParam(param: string | undefined): string | null {
  if (!param) return null;
  if (!WEEK_PARAM_RE.test(param)) return null;

  const date = new Date(`${param}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  // Round-trip rejects values like '2026-13-99' that Date silently
  // shifts into a different valid date.
  if (date.toISOString().slice(0, 10) !== param) return null;

  // Future dates have no insight rows by construction; reject defensively
  // so the page never wastes a DB roundtrip on them.
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (param > todayUtc) return null;

  return param;
}
