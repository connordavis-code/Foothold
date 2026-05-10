import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { parseScenariosQuery } from '@/lib/forecast/comparison';
import { CompareClient } from './compare-client';

/**
 * /simulator/compare — Phase 1 simulator reorientation, PR 3 of 5.
 *
 * Multi-scenario overlay view. Reads ?scenarios=id1,id2,id3 (comma-
 * separated, max 3) and renders baseline + each as a line on one chart,
 * plus per-scenario delta cards and a goal-impact matrix.
 *
 * Server fetches all the user's saved scenarios (for the picker) and
 * the forecast history. The selected scenarios are filtered server-side
 * against the user's scenario list, so a stale URL with a deleted-id
 * gracefully drops the missing one rather than crashing.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ scenarios?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [params, history, scenarios] = await Promise.all([
    searchParams,
    getForecastHistory(userId),
    listScenariosForUser(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // parseScenariosQuery already trims, dedupes, and caps at 3.
  const requestedIds = parseScenariosQuery(params.scenarios);
  // Drop any IDs the user no longer owns (deleted scenario, stale URL).
  const validIds = new Set(scenarios.map((s) => s.id));
  const initialSelectedIds = requestedIds.filter((id) => validIds.has(id));

  return (
    <CompareClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialSelectedIds={initialSelectedIds}
    />
  );
}
