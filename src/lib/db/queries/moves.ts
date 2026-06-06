import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  goalMoves,
  scenarioMoves,
  type GoalMove,
  type ScenarioMove,
  type GoalMoveInsert,
} from '@/lib/db/schema';
import { stableStringify } from '@/lib/json';

/**
 * Load all goal moves owned by the user.
 * Used by the /goals page and goal-detail routes to display
 * attached moves and by the forecast projection consumers to apply
 * move deltas to the baseline.
 */
export async function getGoalMoves(userId: string): Promise<GoalMove[]> {
  return db
    .select()
    .from(goalMoves)
    .where(eq(goalMoves.userId, userId));
}

/**
 * Load all scenario moves owned by the user.
 * Used by the /simulator page to display and apply ephemeral
 * move deltas layered on top of the goal-move-augmented baseline.
 */
export async function getScenarioMoves(userId: string): Promise<ScenarioMove[]> {
  return db
    .select()
    .from(scenarioMoves)
    .where(eq(scenarioMoves.userId, userId));
}

/**
 * Load goal moves for a specific goal, scoped to the user.
 * Used by goal-detail and move-editor routes to display moves
 * attached to a particular goal.
 */
export async function getGoalMovesByGoalId(
  userId: string,
  goalId: string,
): Promise<GoalMove[]> {
  return db
    .select()
    .from(goalMoves)
    .where(and(eq(goalMoves.userId, userId), eq(goalMoves.goalId, goalId)));
}

/**
 * Server actions must call this before INSERT so a double-click or network
 * retry of attachGoalMoveAction doesn't write a second identical row.
 * Matches on (goalId, templateKey, params) — userId equality is enforced
 * upstream by the query that produces `existing`.
 */
export function findDuplicateMove(
  input: Pick<GoalMoveInsert, 'goalId' | 'templateKey' | 'params'>,
  existing: GoalMove[],
): GoalMove | null {
  const inputParamsJson = stableStringify(input.params);

  for (const row of existing) {
    const rowParamsJson = stableStringify(row.params);

    if (
      row.goalId === input.goalId &&
      row.templateKey === input.templateKey &&
      inputParamsJson === rowParamsJson
    ) {
      return row;
    }
  }

  return null;
}
