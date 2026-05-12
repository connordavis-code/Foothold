import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { getSourceHealth } from '@/lib/db/queries/health';
import { formatFreshness } from '@/lib/format/freshness';
import {
  parseView,
  parseRange,
  parseScenario,
  defaultView,
} from '@/lib/simulator/url-state';
import { SimulatorClient } from './simulator-client';

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; view?: string; range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [params, history, scenarios, sourceHealth] = await Promise.all([
    searchParams,
    getForecastHistory(userId),
    listScenariosForUser(userId),
    getSourceHealth(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const initialScenarioId = parseScenario(params.scenario, scenarios);
  const initialScenario = initialScenarioId
    ? scenarios.find((s) => s.id === initialScenarioId) ?? null
    : scenarios[0] ?? null;

  const initialView = parseView(params.view) ?? defaultView(scenarios, initialScenario);
  const initialRange = parseRange(params.range) ?? '1Y';

  const sources = sourceHealth.map((s) => ({
    name: s.institutionName ?? 'Source',
    lastSyncAt: s.lastSuccessfulSyncAt,
  }));
  const freshness = formatFreshness({ sources, now });

  return (
    <SimulatorClient
      history={history}
      scenarios={scenarios}
      currentMonth={currentMonth}
      initialScenario={initialScenario}
      initialView={initialView}
      initialRange={initialRange}
      freshness={freshness}
    />
  );
}
