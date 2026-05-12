import type { Scenario } from '@/lib/db/schema';

export type ViewParam = 'empty' | 'moves' | 'comparison';
export type RangeParam = '1Y' | '2Y';

const VALID_VIEWS: readonly ViewParam[] = ['empty', 'moves', 'comparison'];
const VALID_RANGES: readonly RangeParam[] = ['1Y', '2Y'];

export function parseView(input: unknown): ViewParam | null {
  return typeof input === 'string' && (VALID_VIEWS as readonly string[]).includes(input)
    ? (input as ViewParam)
    : null;
}

export function parseRange(input: unknown): RangeParam | null {
  return typeof input === 'string' && (VALID_RANGES as readonly string[]).includes(input)
    ? (input as RangeParam)
    : null;
}

export function parseScenario(
  input: unknown,
  scenarios: Pick<Scenario, 'id'>[],
): string | null {
  if (typeof input !== 'string') return null;
  return scenarios.some((s) => s.id === input) ? input : null;
}

export function defaultView(
  scenarios: Pick<Scenario, 'id'>[],
  initialScenario: Pick<Scenario, 'id'> | null,
): ViewParam {
  return scenarios.length === 0 && !initialScenario ? 'empty' : 'comparison';
}

export type BuildUrlInput = {
  view: ViewParam;
  range: RangeParam;
  scenarioId: string | null;
};

export function buildSimulatorUrl({ view, range, scenarioId }: BuildUrlInput): string {
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('range', range);
  if (scenarioId) params.set('scenario', scenarioId);
  return `/simulator?${params.toString()}`;
}
