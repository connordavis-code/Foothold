import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { listScenariosForUser } from '@/lib/db/queries/scenarios';
import { getSourceHealth } from '@/lib/db/queries/health';
import { getGoalMoves, getScenarioMoves } from '@/lib/db/queries/moves';
import { getRecurringStreams } from '@/lib/db/queries/recurring';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import { humanizeCategory } from '@/lib/format/category';
import { formatFreshness } from '@/lib/format/freshness';
import { parseRange, parseScenario } from '@/lib/simulator/url-state';
import { SimulatorClient } from './simulator-client';

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; range?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [
    params,
    history,
    scenarios,
    sourceHealth,
    initialGoalMoves,
    initialScenarioMoves,
    streams,
    categoryOptions,
  ] = await Promise.all([
    searchParams,
    getForecastHistory(userId),
    listScenariosForUser(userId),
    getSourceHealth(userId),
    getGoalMoves(userId),
    getScenarioMoves(userId),
    getRecurringStreams(userId),
    getCategoryOptions(userId),
  ]);

  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Scenario-first: default to the first saved scenario when the URL doesn't
  // name a valid one, so a returning user lands on a populated chart.
  const urlScenarioId = parseScenario(params.scenario, scenarios);
  const initialScenarioId = urlScenarioId ?? scenarios[0]?.id ?? null;
  const initialRange = parseRange(params.range) ?? '1Y';

  // getCategoryOptions returns { id, name, source } — map to the { key, label }
  // shape MoveEditor expects (key is the PFC string the engine keys on).
  const categories = categoryOptions.map((opt) => ({
    key: opt.name,
    label: humanizeCategory(opt.name),
  }));

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
      initialScenarioId={initialScenarioId}
      initialRange={initialRange}
      freshness={freshness}
      initialGoalMoves={initialGoalMoves}
      initialScenarioMoves={initialScenarioMoves}
      streams={streams}
      categories={categories}
    />
  );
}
