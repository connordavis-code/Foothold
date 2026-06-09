'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { goalMoves, scenarioMoves } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import {
  getGoalMovesByGoalId,
  getScenarioMovesByScenarioId,
  findDuplicateMove,
  findDuplicateScenarioMove,
} from '@/lib/db/queries/moves';
import { getScenario } from '@/lib/db/queries/scenarios';
import {
  goalMoveInputSchema,
  scenarioMoveInputSchema,
} from '@/lib/moves/validation';
import { decideGoalMoveUpdate } from '@/lib/moves/update-decision';
import {
  checkDisjointWithOverrides,
  DisjointViolationError,
} from '@/lib/moves/disjoint';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Revalidate all surfaces that project goal_moves into derived numbers.
// /goals renders move lists + pace verdicts; /dashboard + /simulator consume
// the same projection baseline once T16 wires applyGoalMoves into the
// forecast engine.
// TODO(T16): confirm /dashboard and /simulator revalidation is still needed
// after the engine wire-up. Until then, invalidate all three to keep
// projection consumers fresh after any move mutation.
function revalidateMoveConsumers() {
  revalidatePath('/goals');
  revalidatePath('/dashboard');
  revalidatePath('/simulator');
}

// =============================================================================
// Goal-side move CRUD
// =============================================================================

/**
 * Attach a move to a goal.
 *
 * Idempotent: if an identical (goalId, templateKey, params) row already
 * exists for this user, returns the existing row's id without INSERT.
 * This handles double-click and network-retry cases cleanly.
 */
export async function attachGoalMoveAction(
  rawInput: unknown,
): Promise<ActionResult<{ moveId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };
  const userId = session.user.id;

  const parsed = goalMoveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    const msg = path ? `${path}: ${first?.message}` : (first?.message ?? 'Invalid input');
    return { ok: false, error: msg };
  }

  const { goalId, templateKey, params, source } = parsed.data;

  try {
    // Dedup check: fetch existing moves scoped to this goal + user. Cross-goal
    // rows can't match the duplicate predicate anyway, so narrowing by goalId
    // keeps the scan bounded as a user's total move count grows.
    const existing = await getGoalMovesByGoalId(userId, goalId);
    const duplicate = findDuplicateMove({ goalId, templateKey, params }, existing);

    if (duplicate) {
      // Idempotent: caller gets the existing row's id as if they inserted it.
      return { ok: true, data: { moveId: duplicate.id } };
    }

    const [row] = await db
      .insert(goalMoves)
      .values({ userId, goalId, templateKey, params, source })
      .returning({ id: goalMoves.id });

    revalidateMoveConsumers();
    return { ok: true, data: { moveId: row.id } };
  } catch (err) {
    await logError('goal_move.attach', err, { userId, goalId, templateKey });
    return { ok: false, error: 'Could not attach move' };
  }
}

/**
 * Detach (delete) a move from a goal.
 *
 * IDOR-safe: WHERE clause scopes on (id, userId) so a leaked moveId in
 * a different session cannot delete another user's row.
 */
export async function detachGoalMoveAction(
  moveId: string,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };
  const userId = session.user.id;

  if (!moveId || typeof moveId !== 'string') {
    return { ok: false, error: 'moveId is required' };
  }

  try {
    await db
      .delete(goalMoves)
      .where(and(eq(goalMoves.id, moveId), eq(goalMoves.userId, userId)));

    revalidateMoveConsumers();
    return { ok: true, data: null };
  } catch (err) {
    await logError('goal_move.detach', err, { userId, moveId });
    return { ok: false, error: 'Could not detach move' };
  }
}

/**
 * Update a goal move's params.
 *
 * Validates the incoming params against the EXISTING row's templateKey so
 * callers cannot drift the row's contract (e.g. pass adjust-recurring params
 * into a reduce-category row). Fetches the row first; returns not-found if
 * the row doesn't belong to this user (IDOR-safe).
 */
export async function updateGoalMoveAction(
  moveId: string,
  params: unknown,
): Promise<ActionResult<{ moveId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };
  const userId = session.user.id;

  if (!moveId || typeof moveId !== 'string') {
    return { ok: false, error: 'moveId is required' };
  }

  try {
    // Fetch the existing row to derive templateKey before validating params.
    // IDOR: scoped on (id, userId) — a foreign moveId returns 0 rows.
    const [existing] = await db
      .select()
      .from(goalMoves)
      .where(and(eq(goalMoves.id, moveId), eq(goalMoves.userId, userId)));

    if (!existing) {
      return { ok: false, error: 'Move not found' };
    }

    // Delegate the Zod-input reconstruction + no-op-vs-update decision to the
    // pure helper so it's unit-testable in isolation; the action layer owns
    // only the auth + DB-write side. The helper's union never returns an
    // 'insert' arm, so this code path cannot create a duplicate row.
    const decision = decideGoalMoveUpdate(existing, params);
    if (decision.kind === 'invalid') {
      return { ok: false, error: decision.error };
    }
    if (decision.kind === 'no-op') {
      // Params semantically unchanged — skip the UPDATE so updated_at doesn't
      // drift for a write that would change nothing. Idempotent re-submit.
      return { ok: true, data: { moveId } };
    }

    await db
      .update(goalMoves)
      .set({ params: decision.params, updatedAt: new Date() })
      .where(and(eq(goalMoves.id, moveId), eq(goalMoves.userId, userId)));

    revalidateMoveConsumers();
    return { ok: true, data: { moveId } };
  } catch (err) {
    await logError('goal_move.update', err, { userId, moveId });
    return { ok: false, error: 'Could not update move' };
  }
}

// =============================================================================
// Scenario-side move CRUD (T18 — C2-minus-T17)
// =============================================================================
//
// R.4 C2 ships a hybrid two-store model: four "cleanly mappable" capabilities
// migrate to scenario_move (reduce-category cuts, adjust-recurring pause/edit,
// skip-once, income-event); four "un-mapped" capabilities stay in
// scenario.overrides (lump sums, hypothetical-add recurring, hypothetical
// goals, goal-target-edits). The Zod discriminator on scenarioMoveInputSchema
// only admits the four mapped templateKeys — un-mapped capabilities cannot
// reach this action.
//
// Disjoint-stores invariant (load-bearing): each capability lives in exactly
// one store per scenario. checkDisjointWithOverrides is called BEFORE every
// INSERT to assert overrides does not already carry the same target. A
// violation throws DisjointViolationError (dev + Vercel preview) so the
// invariant breach is impossible to miss during testing; in prod it returns
// ok:false with the conflict string so the UI shows a visible toast — never
// silent (Q3 founder rule).

/**
 * Attach a scenario_move to a saved scenario.
 *
 * Validates ownership of the scenario, then asserts the disjoint-stores
 * invariant against the scenario's overrides JSON. Idempotent on
 * (scenarioId, templateKey, params) — double-click and retry safe.
 */
export async function attachScenarioMoveAction(
  rawInput: unknown,
): Promise<ActionResult<{ moveId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };
  const userId = session.user.id;

  const parsed = scenarioMoveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? '';
    const msg = path ? `${path}: ${first?.message}` : (first?.message ?? 'Invalid input');
    return { ok: false, error: msg };
  }

  const { scenarioId, templateKey, params } = parsed.data;

  try {
    // IDOR-safe scenario fetch + ownership check + overrides extraction in
    // one query. A foreign scenarioId returns null.
    const scenario = await getScenario(userId, scenarioId);
    if (!scenario) {
      return { ok: false, error: 'Scenario not found' };
    }

    // Disjoint-stores invariant. A violation means either a write-guard bug
    // or bad migration data — surface it LOUDLY. In dev + Vercel preview,
    // throw DisjointViolationError so the failure is impossible to miss
    // during testing. In prod, return ok:false with the conflict string so
    // the toast carries the specific reason — never silent.
    const disjoint = checkDisjointWithOverrides(parsed.data, scenario.overrides);
    if (!disjoint.ok) {
      await logError(
        'scenario_move.disjoint_violation',
        new DisjointViolationError(disjoint.conflict),
        { userId, scenarioId, templateKey, params },
      );

      const isDevOrPreview =
        process.env.NODE_ENV !== 'production' ||
        process.env.VERCEL_ENV === 'preview';
      if (isDevOrPreview) {
        throw new DisjointViolationError(disjoint.conflict);
      }
      return { ok: false, error: disjoint.conflict };
    }

    // Idempotency: dedup against existing scenario_moves for this scenario.
    // Reuses the shared stableStringify-equality predicate via
    // findDuplicateScenarioMove — same canonical-JSON semantics as the
    // goal side (Q4(b)).
    const existing = await getScenarioMovesByScenarioId(userId, scenarioId);
    const duplicate = findDuplicateScenarioMove(
      { scenarioId, templateKey, params },
      existing,
    );
    if (duplicate) {
      return { ok: true, data: { moveId: duplicate.id } };
    }

    const [row] = await db
      .insert(scenarioMoves)
      .values({ userId, scenarioId, templateKey, params })
      .returning({ id: scenarioMoves.id });

    revalidatePath('/simulator');
    return { ok: true, data: { moveId: row.id } };
  } catch (err) {
    // Disjoint violation must escape the generic-error swallow — it is the
    // signal Q3 demands surface loudly during dev/preview UAT.
    if (err instanceof DisjointViolationError) throw err;
    await logError('scenario_move.attach', err, { userId, scenarioId, templateKey });
    return { ok: false, error: 'Could not attach scenario move' };
  }
}

/**
 * Detach (delete) a scenario_move.
 *
 * IDOR-safe: WHERE scopes on (id, userId). No disjoint check needed —
 * removing a row cannot create cross-store duplication.
 */
export async function detachScenarioMoveAction(
  moveId: string,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };
  const userId = session.user.id;

  if (!moveId || typeof moveId !== 'string') {
    return { ok: false, error: 'moveId is required' };
  }

  try {
    await db
      .delete(scenarioMoves)
      .where(and(eq(scenarioMoves.id, moveId), eq(scenarioMoves.userId, userId)));

    revalidatePath('/simulator');
    return { ok: true, data: null };
  } catch (err) {
    await logError('scenario_move.detach', err, { userId, moveId });
    return { ok: false, error: 'Could not detach scenario move' };
  }
}
