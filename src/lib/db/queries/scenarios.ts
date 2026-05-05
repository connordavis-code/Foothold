import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scenarios, type Scenario } from '@/lib/db/schema';

/**
 * List all scenarios owned by the user, most-recently-updated first.
 * Used by the /simulator page server component to populate the
 * scenario selector dropdown.
 */
export async function listScenariosForUser(userId: string): Promise<Scenario[]> {
  return db
    .select()
    .from(scenarios)
    .where(eq(scenarios.userId, userId))
    .orderBy(desc(scenarios.updatedAt));
}

/**
 * Load a single scenario by id, scoped to the user (so a malicious
 * id in the URL can't leak another user's scenario).
 * Returns null if not found OR not owned by this user.
 */
export async function getScenario(
  userId: string,
  scenarioId: string,
): Promise<Scenario | null> {
  const rows = await db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
