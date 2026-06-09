import type { ScenarioOverrides } from '@/lib/forecast/types';
import type { ScenarioMoveInput } from './validation';

/**
 * Result of the pre-write disjointness check for an incoming scenario_move.
 *
 * `ok: false` carries a user-facing `conflict` string suitable for surfacing
 * in a toast or rethrowing as an Error.message. The message names the
 * conflicting capability so the user can locate and remove it from the
 * overrides editor.
 */
export type DisjointCheckResult =
  | { ok: true }
  | { ok: false; conflict: string };

/**
 * Pre-write guard: asserts the incoming scenario_move does NOT duplicate a
 * capability already carried by the scenario's `overrides` JSON.
 *
 * R.4 C2 ships a hybrid two-store model — four "cleanly mappable"
 * capabilities migrate to `scenario_move`, four "un-mapped" capabilities
 * stay in `scenario.overrides`. The hybrid is only safe under the
 * **disjoint-stores invariant**: each capability lives in exactly one
 * store per scenario, never both. Dual-presence would double-apply the
 * capability through the engine (apply-overrides + apply-moves layered),
 * silently producing a wrong projection that looks like a normal success
 * (the "look-alike-success" class from 2026-05-13).
 *
 * Capability mapping (scenario_move kind → overrides sub-tree → match rule):
 *
 *   reduce-category  → categoryDeltas[]         → same categoryId, any sign
 *   adjust-recurring → recurringChanges[]       → same streamId AND action ∈ {pause, edit}
 *                                                 (action='add' rows are hypothetical
 *                                                  new streams, never collide)
 *   skip-once        → skipRecurringInstances[] → same (streamId, skipMonth)
 *   income-event     → incomeDelta              → any non-zero incomeDelta
 *
 * The rule is strict per-target: any same-target match in overrides blocks
 * the write. Caller is expected to surface the conflict loudly (throw in
 * dev/preview, return ok:false with the conflict string in prod) — never
 * clamp silently. Pure function: no DB, no side effects, deterministic.
 */
export function checkDisjointWithOverrides(
  input: ScenarioMoveInput,
  overrides: ScenarioOverrides | null | undefined,
): DisjointCheckResult {
  if (!overrides) return { ok: true };

  switch (input.templateKey) {
    case 'reduce-category': {
      const categoryId = input.params.categoryKey;
      const hit = overrides.categoryDeltas?.find(
        (c) => c.categoryId === categoryId,
      );
      if (hit) {
        return {
          ok: false,
          conflict:
            `Scenario overrides already carry a category change for "${categoryId}". ` +
            `Remove it from the overrides editor before attaching a reduce-category move.`,
        };
      }
      return { ok: true };
    }
    case 'adjust-recurring': {
      const streamId = input.params.streamId;
      const hit = overrides.recurringChanges?.find(
        (r) =>
          r.streamId === streamId &&
          (r.action === 'pause' || r.action === 'edit'),
      );
      if (hit) {
        return {
          ok: false,
          conflict:
            `Scenario overrides already carry a pause/edit for recurring stream "${streamId}". ` +
            `Remove it from the overrides editor before attaching an adjust-recurring move.`,
        };
      }
      return { ok: true };
    }
    case 'skip-once': {
      const { streamId, month } = input.params;
      const hit = overrides.skipRecurringInstances?.find(
        (s) => s.streamId === streamId && s.skipMonth === month,
      );
      if (hit) {
        return {
          ok: false,
          conflict:
            `Scenario overrides already skip stream "${streamId}" in ${month}. ` +
            `Remove the override-side skip before attaching a skip-once move.`,
        };
      }
      return { ok: true };
    }
    case 'income-event': {
      if (overrides.incomeDelta && overrides.incomeDelta.monthlyDelta !== 0) {
        return {
          ok: false,
          conflict:
            `Scenario overrides already carry an income delta. ` +
            `Remove it from the overrides editor before attaching an income-event move.`,
        };
      }
      return { ok: true };
    }
  }
}

/**
 * Sentinel error type for the disjoint-stores invariant violation.
 *
 * Action layers re-throw this specifically so the catch block does not
 * convert it to a generic "Could not attach" — Q3 founder rule:
 * a fired assertion means a write-guard bug or bad migration data;
 * surface it loudly. Never silent.
 */
export class DisjointViolationError extends Error {
  readonly conflict: string;
  constructor(conflict: string) {
    super(`Disjoint stores invariant violated: ${conflict}`);
    this.name = 'DisjointViolationError';
    this.conflict = conflict;
  }
}
