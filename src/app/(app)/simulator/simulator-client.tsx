'use client';

import { useMemo, useState } from 'react';
import type { Scenario } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import { ScenarioHeader } from '@/components/simulator/scenario-header';
import { OverrideSection } from '@/components/simulator/override-section';
import { CategoryOverrides } from '@/components/simulator/category-overrides';
import { LumpSumOverrides } from '@/components/simulator/lump-sum-overrides';
import { RecurringOverrides } from '@/components/simulator/recurring-overrides';
import { IncomeOverrides } from '@/components/simulator/income-overrides';
import { HypotheticalGoalOverrides } from '@/components/simulator/hypothetical-goal-overrides';
import { GoalTargetOverrides } from '@/components/simulator/goal-target-overrides';
import { SkipRecurringOverrides } from '@/components/simulator/skip-recurring-overrides';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { GoalDiffCards } from '@/components/simulator/goal-diff-cards';
import { NarrativePanel } from '@/components/simulator/narrative-panel';

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

  const baselineResult = useMemo(
    () => projectCash({ history, overrides: {}, currentMonth }),
    [history, currentMonth],
  );

  const availableMonths = useMemo(
    () => engineResult.projection.map((m) => m.month),
    [engineResult],
  );

  const hasOverrides = useMemo(() => {
    return Boolean(
      liveOverrides.categoryDeltas?.length ||
        liveOverrides.lumpSums?.length ||
        liveOverrides.recurringChanges?.length ||
        liveOverrides.skipRecurringInstances?.length ||
        liveOverrides.incomeDelta ||
        liveOverrides.hypotheticalGoals?.length ||
        liveOverrides.goalTargetEdits?.length,
    );
  }, [liveOverrides]);

  const handleSelectScenario = (id: string | null) => {
    const scn = id ? scenarios.find((s) => s.id === id) : null;
    setSelectedScenarioId(id);
    setLiveOverrides((scn?.overrides as ScenarioOverrides | undefined) ?? {});
  };

  const hasNoData =
    history.currentCash === 0 &&
    history.recurringStreams.length === 0 &&
    Object.keys(history.categoryHistory).length === 0;

  if (hasNoData) {
    return (
      <div className="px-6 py-8 max-w-6xl">
        <ScenarioHeader
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          liveOverrides={liveOverrides}
          isDirty={isDirty}
          onSelect={handleSelectScenario}
        />
        <div className="bg-muted/40 border border-border rounded-lg p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">No data yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The simulator forecasts forward from your synced transactions and
            recurring streams. Once Plaid finishes its first sync (typically
            within a few minutes of connecting), the forecast will fill in here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl">
      <ScenarioHeader
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        liveOverrides={liveOverrides}
        isDirty={isDirty}
        onSelect={handleSelectScenario}
      />

      {scenarios.length === 0 && (
        <p className="text-xs text-muted-foreground -mt-4 mb-6">
          You're viewing the baseline forecast. Add overrides on the left and click
          "Save as…" to keep a scenario for later.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 md:gap-10">
        {/* Left: override editor */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            Overrides
          </div>
          <OverrideSection label="Categories" count={liveOverrides.categoryDeltas?.length ?? 0}>
            <CategoryOverrides
              value={liveOverrides.categoryDeltas}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, categoryDeltas: next }))
              }
              knownCategories={history.categories}
            />
          </OverrideSection>
          <OverrideSection label="Lump sums" count={liveOverrides.lumpSums?.length ?? 0}>
            <LumpSumOverrides
              value={liveOverrides.lumpSums}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, lumpSums: next }))
              }
              availableMonths={availableMonths}
            />
          </OverrideSection>
          <OverrideSection label="Recurring" count={liveOverrides.recurringChanges?.length ?? 0}>
            <RecurringOverrides
              value={liveOverrides.recurringChanges}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, recurringChanges: next }))
              }
              baseStreams={history.recurringStreams}
            />
          </OverrideSection>
          <OverrideSection label="Income" count={liveOverrides.incomeDelta ? 1 : 0}>
            <IncomeOverrides
              value={liveOverrides.incomeDelta}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, incomeDelta: next }))
              }
              availableMonths={availableMonths}
            />
          </OverrideSection>
          <OverrideSection label="Hypothetical goals" count={liveOverrides.hypotheticalGoals?.length ?? 0}>
            <HypotheticalGoalOverrides
              value={liveOverrides.hypotheticalGoals}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, hypotheticalGoals: next }))
              }
            />
          </OverrideSection>
          <OverrideSection label="Existing goal edits" count={liveOverrides.goalTargetEdits?.length ?? 0}>
            <GoalTargetOverrides
              value={liveOverrides.goalTargetEdits}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, goalTargetEdits: next }))
              }
              realGoals={history.goals}
            />
          </OverrideSection>
          <OverrideSection label="Skip recurring" count={liveOverrides.skipRecurringInstances?.length ?? 0}>
            <SkipRecurringOverrides
              value={liveOverrides.skipRecurringInstances}
              onChange={(next) =>
                setLiveOverrides((o) => ({ ...o, skipRecurringInstances: next }))
              }
              baseStreams={history.recurringStreams}
              availableMonths={availableMonths}
            />
          </OverrideSection>
        </div>

        {/* Right: forecast chart + goal diff cards */}
        <div>
          <div className="space-y-8">
            <ForecastChart
              baseline={baselineResult.projection}
              scenario={engineResult.projection}
            />
            <GoalDiffCards
              goalImpacts={engineResult.goalImpacts}
              history={history}
              hypotheticalGoals={liveOverrides.hypotheticalGoals}
              currentMonth={currentMonth}
            />
            <NarrativePanel
              scenarioId={selectedScenarioId}
              overrides={liveOverrides}
              isDirty={isDirty}
              hasOverrides={hasOverrides}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
