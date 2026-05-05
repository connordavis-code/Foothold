import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';

/**
 * Simulator page — loads forecast history + saved scenarios on the server,
 * passes them to the client wrapper. Auth is enforced by the (app) layout
 * but we double-check here for defense in depth.
 *
 * The currentMonth is computed server-side (one of the few places a real
 * Date.now() is allowed — the engine itself stays pure).
 */
export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: { scenario?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [history, scenarios] = await Promise.all([
    getForecastHistory(userId),
    listScenariosForUser(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Determine initial scenario: ?scenario=<id> param > most-recently-updated > null (baseline).
  const requestedId = searchParams?.scenario;
  const initialScenario =
    (requestedId && scenarios.find((s) => s.id === requestedId)) ||
    scenarios[0] ||
    null;

  return (
    <div className="px-6 py-8 max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Simulator</h1>
      <pre className="text-xs bg-muted p-4 rounded">
        {JSON.stringify(
          {
            scenarios: scenarios.length,
            currentMonth,
            initialScenarioName: initialScenario?.name ?? '(baseline)',
            historyCash: history.currentCash,
            historyStreams: history.recurringStreams.length,
            historyGoals: history.goals.length,
          },
          null,
          2,
        )}
      </pre>
      <p className="text-sm text-muted-foreground mt-4">
        Scaffold only — client UI lands in Task 4.
      </p>
    </div>
  );
}
