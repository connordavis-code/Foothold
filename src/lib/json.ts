/**
 * Stable JSON serialization — sorts object keys recursively so structurally
 * identical values produce identical strings regardless of insertion order.
 * Arrays retain order (semantically meaningful — `[1,2]` ≠ `[2,1]`).
 * Primitives delegate to `JSON.stringify`.
 *
 * Used by write-correctness gates that compare params for equality:
 *   - `findDuplicateMove` (dedup on `goal_move` attach — SPEC edge case #16)
 *   - `decideGoalMoveUpdate` (no-op detection on `goal_move` edit)
 *
 * Both must agree on equality or the dedup/no-op decisions can disagree
 * about identical inputs — the look-alike-success failure class. One copy.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}
