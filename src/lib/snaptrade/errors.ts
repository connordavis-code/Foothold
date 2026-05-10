/**
 * Pure error-shape detection helpers for SnapTrade SDK errors. Lives
 * separate from `./sync.ts` so tests can import without dragging in
 * crypto/db side-effect imports. Same pattern as `./reconcile.ts`.
 */

/**
 * SnapTrade returns HTTP 410 Gone for activities on brokerages where
 * the data partnership doesn't expose transaction history (most notably
 * Fidelity IRA / Roth / 401k subtypes — positions work, activities
 * don't, permanently). Distinguish from transient 4xx so we can mark
 * transactions not_applicable for those items rather than alarm in the
 * trust strip every cron.
 *
 * Two shapes to recognize:
 *   1. raw axios `AxiosError` — status nested under `err.response.status`
 *   2. `SnaptradeError` — the SDK's wrapper (see node_modules/snaptrade-
 *      typescript-sdk/dist/error.js) FLATTENS axios fields onto itself:
 *      `err.status`, `err.responseBody`, no `err.response`. The wrapper
 *      is the actual shape thrown to userland; the raw axios shape only
 *      appears if a future SDK call escapes the wrapper.
 *
 * Without checking shape (2) every Fidelity-style 410 was falling
 * through to `logError`, writing a `snaptrade.sync.activities` failure
 * row, and alarming the trust strip — Phase 5 dashboard regression
 * observed 2026-05-08.
 */
export function isHttp410(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // SnaptradeError wrapper: flat .status
  if ((err as { status?: unknown }).status === 410) return true;
  // Raw axios shape: nested .response.status
  const r = (err as { response?: unknown }).response;
  if (!r || typeof r !== 'object') return false;
  return (r as { status?: unknown }).status === 410;
}
