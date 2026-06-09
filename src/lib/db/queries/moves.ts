import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  goalMoves,
  scenarioMoves,
  type GoalMove,
  type ScenarioMove,
  type GoalMoveInsert,
  type ScenarioMoveInsert,
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
 * Load scenario moves for a specific scenario, scoped to the user.
 * Used by attachScenarioMoveAction's idempotency check and (post-T21) by
 * the /simulator server component to seed `<SimulatorClient>`'s draftMoves.
 */
export async function getScenarioMovesByScenarioId(
  userId: string,
  scenarioId: string,
): Promise<ScenarioMove[]> {
  return db
    .select()
    .from(scenarioMoves)
    .where(and(eq(scenarioMoves.userId, userId), eq(scenarioMoves.scenarioId, scenarioId)));
}

/**
 * Shared duplicate-row predicate for both goal_move and scenario_move tables.
 *
 * The equality test (stableStringify on params) is identical between the two;
 * only the parent-id column differs (goalId vs scenarioId). Callers supply
 * the parent-match predicate so this helper stays table-agnostic. Keeping the
 * stableStringify call in one place is the load-bearing reason for the
 * generic — duplicating it would let one caller drift from canonical-JSON
 * semantics and silently insert "duplicate" rows that look unique to the
 * other path.
 */
function findDuplicateRow<T extends { templateKey: string; params: unknown }>(
  input: { templateKey: string; params: unknown },
  existing: T[],
  sameParent: (row: T) => boolean,
): T | null {
  const inputParamsJson = stableStringify(input.params);

  for (const row of existing) {
    if (
      sameParent(row) &&
      row.templateKey === input.templateKey &&
      stableStringify(row.params) === inputParamsJson
    ) {
      return row;
    }
  }

  return null;
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
  return findDuplicateRow(
    { templateKey: input.templateKey, params: input.params },
    existing,
    (row) => row.goalId === input.goalId,
  );
}

/**
 * Scenario-side counterpart to findDuplicateMove. Matches on
 * (scenarioId, templateKey, params); userId equality is enforced upstream
 * by the query that produces `existing`. Same canonical-JSON equality
 * semantics as the goal side via the shared findDuplicateRow generic.
 */
export function findDuplicateScenarioMove(
  input: Pick<ScenarioMoveInsert, 'scenarioId' | 'templateKey' | 'params'>,
  existing: ScenarioMove[],
): ScenarioMove | null {
  return findDuplicateRow(
    { templateKey: input.templateKey, params: input.params },
    existing,
    (row) => row.scenarioId === input.scenarioId,
  );
}
