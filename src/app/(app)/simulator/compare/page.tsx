import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { CompareClient } from './compare-client';

/**
 * /simulator/compare — baseline vs one saved scenario.
 *
 * URL: `?scenario=<id>` (single). Reduced from the Phase 1 multi-scenario
 * overlay (was `?scenarios=id1,id2,id3`) because the new <ForecastChart>
 * accepts a singular `scenario` prop. Multi-scenario overlay deferred.
 *
 * Server fetches all the user's saved scenarios (for the picker) and the
 * forecast history. A stale URL with a deleted id is handled client-side
 * (ScenarioPicker validates against the live list).
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
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

  // Validate requested scenario against the user's owned list.
  const requestedId = params.scenario ?? null;
  const validIds = new Set(scenarios.map((s) => s.id));
  const initialScenarioId = requestedId && validIds.has(requestedId) ? requestedId : null;

  return (
    <CompareClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialScenarioId={initialScenarioId}
    />
  );
}
