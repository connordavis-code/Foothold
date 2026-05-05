'use client';

import { useMemo, useState } from 'react';
import type { Scenario } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import { ScenarioHeader } from '@/components/simulator/scenario-header';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenario: Scenario | null;
};

/**
 * Top-level simulator client. Owns:
 *   - selectedScenarioId (which saved scenario is loaded; null = baseline)
 *   - liveOverrides (the in-progress edit; equals selected scenario's overrides until edited)
 *   - engineResult (memoized projectCash output, recomputes when liveOverrides changes)
 *
 * isDirty is computed: liveOverrides differs from the loaded scenario's overrides.
 * Save / Delete actions live in ScenarioHeader; they call the server actions
 * and trigger a router refresh to re-fetch the scenarios list.
 */
export function SimulatorClient({
  history,
  scenarios,
  currentMonth,
  initialScenario,
}: Props) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    initialScenario?.id ?? null,
  );
  const [liveOverrides, setLiveOverrides] = useState<ScenarioOverrides>(
    (initialScenario?.overrides as ScenarioOverrides | undefined) ?? {},
  );

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  const isDirty = useMemo(() => {
    const saved = (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? {};
    return JSON.stringify(saved) !== JSON.stringify(liveOverrides);
  }, [selectedScenario, liveOverrides]);

  const engineResult = useMemo(
    () => projectCash({ history, overrides: liveOverrides, currentMonth }),
    [history, liveOverrides, currentMonth],
  );

  const handleSelectScenario = (id: string | null) => {
    const scn = id ? scenarios.find((s) => s.id === id) : null;
    setSelectedScenarioId(id);
    setLiveOverrides((scn?.overrides as ScenarioOverrides | undefined) ?? {});
  };

  return (
    <div className="px-6 py-8 max-w-6xl">
      <ScenarioHeader
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        liveOverrides={liveOverrides}
        isDirty={isDirty}
        onSelect={handleSelectScenario}
      />

      {/* Engine result debug — replaced in Wave 4 */}
      <div className="bg-muted/40 border border-border rounded-lg p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Engine result (live)
        </div>
        <pre className="text-xs overflow-x-auto">
          {JSON.stringify(
            {
              projectionMonths: engineResult.projection.length,
              endCashMonth0: engineResult.projection[0]?.endCash,
              goalImpacts: engineResult.goalImpacts,
              isDirty,
            },
            null,
            2,
          )}
        </pre>
      </div>
    </div>
  );
}
