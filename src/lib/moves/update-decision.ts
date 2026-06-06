import { goalMoveInputSchema } from '@/lib/moves/validation';

// Stable JSON serialization (sorts keys recursively) so structurally
// identical params with different key insertion order compare as equal.
// Mirrors the helper in src/lib/db/queries/moves.ts; duplicated to keep
// this module dependency-free of the DB-query layer. If a third consumer
// appears, promote to a shared @/lib/json module.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export type GoalMoveUpdateDecision =
  | { kind: 'no-op' }
  | { kind: 'invalid'; error: string }
  | { kind: 'update'; params: Record<string, unknown> };

export type ExistingGoalMoveSlice = {
  templateKey: string;
  goalId: string;
  params: unknown;
};

/**
 * Decide what updateGoalMoveAction should do given an existing row and new
 * params. Three outcomes, three arms — no INSERT path by construction, so
 * the helper cannot create a duplicate row regardless of input.
 *
 * - Re-validates new params via goalMoveInputSchema reconstructed with the
 *   existing row's templateKey + goalId. A caller can't drift the template
 *   contract by handing a different templateKey through the action signature.
 * - Returns 'no-op' if validated new params semantically equal existing
 *   params (key-order-independent). Skips the UPDATE entirely; the action
 *   layer returns success without writing.
 * - Returns 'invalid' on Zod failure; caller surfaces to UI, no DB write.
 * - Returns 'update' otherwise; caller writes the new params + updated_at
 *   under a (id, userId)-scoped WHERE.
 */
export function decideGoalMoveUpdate(
  existing: ExistingGoalMoveSlice,
  newParams: unknown,
): GoalMoveUpdateDecision {
  const validationInput = {
    templateKey: existing.templateKey,
    goalId: existing.goalId,
    params: newParams,
  };
  const parsed = goalMoveInputSchema.safeParse(validationInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    const error = path ? `${path}: ${first?.message}` : (first?.message ?? 'Invalid params');
    return { kind: 'invalid', error };
  }

  if (stableStringify(existing.params) === stableStringify(parsed.data.params)) {
    return { kind: 'no-op' };
  }

  return { kind: 'update', params: parsed.data.params };
}
