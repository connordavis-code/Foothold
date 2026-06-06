'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { goalMoves } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { getGoalMovesByGoalId, findDuplicateMove } from '@/lib/db/queries/moves';
import { goalMoveInputSchema } from '@/lib/moves/validation';
import { decideGoalMoveUpdate } from '@/lib/moves/update-decision';

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
// Scenario-side stubs — wired in C2
// =============================================================================

export async function attachScenarioMoveAction(_input: unknown): Promise<never> {
  throw new Error('attachScenarioMoveAction not yet implemented — wired in C2');
}

export async function detachScenarioMoveAction(_moveId: string): Promise<never> {
  throw new Error('detachScenarioMoveAction not yet implemented — wired in C2');
}
