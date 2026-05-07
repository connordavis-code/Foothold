import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { goals } from '@/lib/db/schema';
import {
  getGoalsWithProgress,
  type GoalWithProgress,
} from './goals';

/**
 * Single-goal lookup scoped to the signed-in user. Returns null when the
 * goal doesn't exist OR isn't owned by `userId` (the URL param is
 * untrusted — never short-circuit this check).
 *
 * Reuses getGoalsWithProgress's shape so detail components can consume the
 * same GoalWithProgress type as /goals' leaderboard.
 */
export async function getGoalDetail(
  goalId: string,
  userId: string,
): Promise<GoalWithProgress | null> {
  // First confirm the goal exists AND is owned by this user. Cheap guard
  // before computing the heavier progress aggregates.
  const [row] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  if (!row) return null;

  // Compute the user's full goal set with progress, then pick out this one.
  // Reused for shape parity with /goals; if N grows large enough that this
  // is a perf concern, factor out the per-goal progress computation.
  const all = await getGoalsWithProgress(userId);
  return all.find((g) => g.id === goalId) ?? null;
}
