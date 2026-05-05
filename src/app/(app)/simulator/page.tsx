import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { SimulatorClient } from './simulator-client';

export default async function SimulatorPage({
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

  const requestedId = params.scenario;
  const initialScenario =
    (requestedId && scenarios.find((s) => s.id === requestedId)) ||
    scenarios[0] ||
    null;

  return (
    <SimulatorClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialScenario={initialScenario}
    />
  );
}
