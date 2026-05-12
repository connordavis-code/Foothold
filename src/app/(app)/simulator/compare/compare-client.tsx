'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { GoalImpacts } from '@/components/simulator/goal-impacts';
import { ScenarioCards } from '@/components/simulator/scenario-cards';
import { ScenarioPicker } from '@/components/simulator/scenario-picker';
import type { Scenario } from '@/lib/db/schema';
import { deriveChartMarkers } from '@/lib/simulator/markers';
import { projectCash } from '@/lib/forecast/engine';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenarioId: string | null;
};

/**
 * Client owner of the compare view.
 *
 * Reduced from "overlay up to 3 scenarios" to "baseline vs one saved
 * scenario" — the new <ForecastChart> accepts a singular `scenario` prop
 * (not an array). Multi-scenario overlay is deferred.
 *
 * URL source of truth: `?scenario=<id>` (single). Picker writes the param;
 * back/forward correctly restores selection.
 */
export function CompareClient({
  history,
  scenarios,
  currentMonth,
  initialScenarioId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Re-derive from URL on every render so back/forward works correctly.
  const selectedScenarioId = useMemo<string | null>(() => {
    const raw = searchParams.get('scenario');
    if (!raw) return initialScenarioId;
    // Validate against owned scenarios — stale URL with deleted id → null.
    return scenarios.some((s) => s.id === raw) ? raw : null;
  }, [searchParams, initialScenarioId, scenarios]);

  const setSelectedScenarioId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next) {
        params.delete('scenario');
      } else {
        params.set('scenario', next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const baseline = useMemo(
    () => projectCash({ history, overrides: {}, currentMonth }).projection,
    [history, currentMonth],
  );

  const scenarioResult = useMemo(() => {
    if (!selectedScenarioId) return null;
    const scn = scenarios.find((s) => s.id === selectedScenarioId);
    if (!scn) return null;
    const overrides = scn.overrides as ScenarioOverrides;
    return projectCash({ history, overrides, currentMonth });
  }, [selectedScenarioId, scenarios, history, currentMonth]);

  const scenarioProjection = scenarioResult?.projection ?? baseline;
  const goalImpacts = scenarioResult?.goalImpacts ?? [];

  const markers = useMemo(
    () => deriveChartMarkers(baseline, scenarioProjection, goalImpacts, currentMonth, '1Y'),
    [baseline, scenarioProjection, goalImpacts, currentMonth],
  );

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;
  const baselineEndCash = baseline[baseline.length - 1]?.endCash ?? 0;
  const scenarioEndCash = scenarioProjection[scenarioProjection.length - 1]?.endCash ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
      <header className="space-y-1.5 border-b border-hairline pb-4">
        <p className="text-eyebrow">Plan</p>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Compare scenarios
          </h1>
          <Link
            href="/simulator"
            className="text-sm text-text-3 hover:text-foreground"
          >
            ← back to Simulator
          </Link>
        </div>
        <p className="text-sm text-text-3">
          Select a saved scenario to compare against the baseline forecast.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-3">
          {selectedScenario
            ? <>Comparing <span className="text-foreground">{selectedScenario.name}</span> vs baseline</>
            : 'No scenario selected — showing baseline only.'}
        </p>
        <ScenarioPicker
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelect={setSelectedScenarioId}
        />
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline bg-surface px-5 py-10 text-center">
          <p className="text-sm text-text-3">
            No saved scenarios yet. Create one in the{' '}
            <Link href="/simulator" className="underline hover:text-foreground">
              Simulator
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <ForecastChart
            baseline={baseline}
            scenario={scenarioProjection}
            markers={markers}
            range="1Y"
            showScenario={selectedScenarioId !== null}
          />

          <ScenarioCards
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            liveOverrides={(selectedScenario?.overrides as ScenarioOverrides) ?? {}}
            baselineEndCash={baselineEndCash}
            scenarioEndCash={scenarioEndCash}
            baselineLabel="Baseline projection"
            scenarioLabel={selectedScenario?.name ?? null}
            onSelect={setSelectedScenarioId}
          />

          {goalImpacts.length > 0 && (
            <GoalImpacts goalImpacts={goalImpacts} />
          )}
        </>
      )}
    </div>
  );
}
