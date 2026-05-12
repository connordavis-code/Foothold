'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Scenario } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { FreshnessText } from '@/lib/format/freshness';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import { buildSimulatorUrl, type RangeParam, type ViewParam } from '@/lib/simulator/url-state';
import { deriveChartMarkers } from '@/lib/simulator/markers';
import type { MoveTemplateId } from '@/lib/simulator/moves/templates';
import { findTemplate } from '@/lib/simulator/moves/templates';

import { ScenarioHeader } from '@/components/simulator/scenario-header';
import { SimulatorTabs } from '@/components/simulator/simulator-tabs';
import { OverrideSection } from '@/components/simulator/override-section';
import { CategoryOverrides } from '@/components/simulator/category-overrides';
import { LumpSumOverrides } from '@/components/simulator/lump-sum-overrides';
import { RecurringOverrides } from '@/components/simulator/recurring-overrides';
import { IncomeOverrides } from '@/components/simulator/income-overrides';
import { HypotheticalGoalOverrides } from '@/components/simulator/hypothetical-goal-overrides';
import { GoalTargetOverrides } from '@/components/simulator/goal-target-overrides';
import { SkipRecurringOverrides } from '@/components/simulator/skip-recurring-overrides';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { ChartRangeTabs } from '@/components/simulator/chart-range-tabs';
import { ScenarioCards } from '@/components/simulator/scenario-cards';
import { GoalImpacts } from '@/components/simulator/goal-impacts';
import { EmptyStateCard } from '@/components/simulator/empty-state-card';
import { MovesGrid } from '@/components/simulator/moves/moves-grid';
import { MoveTemplateDrawer } from '@/components/simulator/moves/move-template-drawer';
import { MobileScenarioSaveBar } from '@/components/simulator/mobile-scenario-save-bar';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenario: Scenario | null;
  initialView: ViewParam;
  initialRange: RangeParam;
  freshness: FreshnessText;
};

export function SimulatorClient({
  history,
  scenarios,
  currentMonth,
  initialScenario,
  initialView,
  initialRange,
  freshness,
}: Props) {
  const router = useRouter();

  // State -----------------------------------------------------------------
  const [view, setViewState] = useState<ViewParam>(initialView);
  const [range, setRangeState] = useState<RangeParam>(initialRange);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    initialScenario?.id ?? null,
  );
  const [liveOverrides, setLiveOverrides] = useState<ScenarioOverrides>(
    (initialScenario?.overrides as ScenarioOverrides | undefined) ?? {},
  );
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());
  const [activeMoveTemplate, setActiveMoveTemplate] = useState<MoveTemplateId | null>(null);

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

  const chartMarkers = useMemo(
    () =>
      deriveChartMarkers(
        baselineResult.projection,
        engineResult.projection,
        engineResult.goalImpacts,
        currentMonth,
        range,
      ),
    [baselineResult, engineResult, currentMonth, range],
  );

  const currentMonthlyIncome = useMemo(() => {
    const incomeHistory = history.incomeHistory ?? [];
    if (incomeHistory.length === 0) return 0;
    return incomeHistory.reduce((a, b) => a + b, 0) / incomeHistory.length;
  }, [history.incomeHistory]);

  // URL mirroring --------------------------------------------------------
  const pushUrl = useCallback(
    (next: { view?: ViewParam; range?: RangeParam; scenarioId?: string | null }) => {
      const url = buildSimulatorUrl({
        view: next.view ?? view,
        range: next.range ?? range,
        scenarioId: next.scenarioId === undefined ? selectedScenarioId : next.scenarioId,
      });
      router.push(url, { scroll: false });
    },
    [router, view, range, selectedScenarioId],
  );

  const setView = useCallback(
    (next: ViewParam) => {
      setViewState(next);
      pushUrl({ view: next });
      // Drawer closes when leaving Moves
      if (next !== 'moves') setActiveMoveTemplate(null);
    },
    [pushUrl],
  );

  const setRange = useCallback(
    (next: RangeParam) => {
      setRangeState(next);
      pushUrl({ range: next });
    },
    [pushUrl],
  );

  const handleSelectScenario = useCallback(
    (id: string | null) => {
      const scn = id ? scenarios.find((s) => s.id === id) : null;
      setSelectedScenarioId(id);
      setLiveOverrides((scn?.overrides as ScenarioOverrides | undefined) ?? {});
      pushUrl({ scenarioId: id });
    },
    [scenarios, pushUrl],
  );

  // Override accordion ---------------------------------------------------
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const isMobile =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 767px)').matches;
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (isMobile) next.clear();
        next.add(key);
      }
      return next;
    });
  }, []);

  // Move submit ----------------------------------------------------------
  const handleMoveSubmit = useCallback(
    (templateId: MoveTemplateId, values: Record<string, unknown>) => {
      const template = findTemplate(templateId);
      if (!template) return;
      // Inject derived current monthly income for job-loss applier
      const derived = templateId === 'jobLoss'
        ? { ...values, currentMonthlyIncome }
        : values;
      const next = template.applier(derived, liveOverrides);
      setLiveOverrides(next);
      setActiveMoveTemplate(null);
      setView('comparison');
      setOpenSections((prev) => new Set([...prev, template.targetSection]));
    },
    [liveOverrides, currentMonthlyIncome, setView],
  );

  // Reset ----------------------------------------------------------------
  const handleReset = useCallback(() => {
    const saved = (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? {};
    setLiveOverrides(saved);
  }, [selectedScenario]);

  // Empty-data guard -----------------------------------------------------
  const hasNoData =
    history.currentCash === 0 &&
    history.recurringStreams.length === 0 &&
    Object.keys(history.categoryHistory).length === 0;

  if (hasNoData) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <ScenarioHeader
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          liveOverrides={liveOverrides}
          isDirty={isDirty}
          onSelect={handleSelectScenario}
          onReset={handleReset}
        />
        <div className="rounded-card border border-hairline bg-surface p-8 text-center">
          <h2 className="mb-2 text-lg font-medium text-foreground">No data yet</h2>
          <p className="mx-auto max-w-md text-sm text-text-2">
            The simulator forecasts forward from your synced transactions and recurring streams.
            Once Plaid finishes its first sync, the forecast will fill in here.
          </p>
        </div>
      </div>
    );
  }

  // Disable Pause/Cancel Moves when no recurring streams exist
  const disabledMoves = new Set<MoveTemplateId>();
  if (history.recurringStreams.length === 0) {
    disabledMoves.add('pauseRecurring');
    disabledMoves.add('cancelSub');
  }

  // Chart subtitle (12mo · 2027-05 projected -$X)
  const lastVisible = (range === '1Y' ? 11 : 23);
  const horizonProjected =
    engineResult.projection[lastVisible]?.endCash ?? engineResult.projection.at(-1)?.endCash ?? 0;
  const horizonMonth =
    engineResult.projection[lastVisible]?.month ?? engineResult.projection.at(-1)?.month ?? '';
  const subtitle = `${range === '1Y' ? '12' : '24'} months · ${horizonMonth} projected`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-8 sm:py-8 md:pb-8">
      <ScenarioHeader
        scenarios={scenarios}
        selectedScenarioId={selectedScenarioId}
        liveOverrides={liveOverrides}
        isDirty={isDirty}
        onSelect={handleSelectScenario}
        onReset={handleReset}
      />

      <SimulatorTabs view={view} onChange={setView} />

      {view === 'empty' && (
        <div className="space-y-6">
          <ForecastChart
            baseline={baselineResult.projection}
            scenario={[]}
            markers={chartMarkers}
            range={range}
            showScenario={false}
            subtitle={subtitle}
            freshnessHeadline={freshness.headline}
            freshnessCaveat={freshness.caveat}
          />
          <EmptyStateCard onPickMove={() => setView('moves')} />
        </div>
      )}

      {view === 'moves' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium text-foreground">Pick a Move</h2>
              <p className="text-xs text-text-3">Each Move adds an override and re-runs the projection</p>
            </div>
            <button
              type="button"
              onClick={() => setView('empty')}
              className="text-xs text-text-2 hover:text-foreground"
            >
              Cancel ×
            </button>
          </div>
          <MovesGrid
            onPick={(id) => setActiveMoveTemplate(id)}
            disabledTemplates={disabledMoves}
          />
          <MoveTemplateDrawer
            activeTemplateId={activeMoveTemplate}
            history={history}
            liveOverrides={liveOverrides}
            currentMonth={currentMonth}
            availableMonths={availableMonths}
            onSubmit={handleMoveSubmit}
            onClose={() => setActiveMoveTemplate(null)}
          />
        </div>
      )}

      {view === 'comparison' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr] md:gap-10">
            <div className="rounded-card border border-hairline-strong bg-surface-elevated p-5 shadow-sm">
              <p className="text-eyebrow mb-3">Overrides</p>
              <OverrideSection
                label="Categories"
                count={liveOverrides.categoryDeltas?.length ?? 0}
                open={openSections.has('categories')}
                onToggle={() => toggleSection('categories')}
              >
                <CategoryOverrides
                  value={liveOverrides.categoryDeltas}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, categoryDeltas: next }))}
                  knownCategories={history.categories}
                />
              </OverrideSection>
              <OverrideSection
                label="Lump sums"
                count={liveOverrides.lumpSums?.length ?? 0}
                open={openSections.has('lumpSums')}
                onToggle={() => toggleSection('lumpSums')}
              >
                <LumpSumOverrides
                  value={liveOverrides.lumpSums}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, lumpSums: next }))}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
              <OverrideSection
                label="Recurring"
                count={liveOverrides.recurringChanges?.length ?? 0}
                open={openSections.has('recurring')}
                onToggle={() => toggleSection('recurring')}
              >
                <RecurringOverrides
                  value={liveOverrides.recurringChanges}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, recurringChanges: next }))}
                  baseStreams={history.recurringStreams}
                />
              </OverrideSection>
              <OverrideSection
                label="Income"
                count={liveOverrides.incomeDelta ? 1 : 0}
                open={openSections.has('income')}
                onToggle={() => toggleSection('income')}
              >
                <IncomeOverrides
                  value={liveOverrides.incomeDelta}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, incomeDelta: next }))}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
              <OverrideSection
                label="Hypothetical goals"
                count={liveOverrides.hypotheticalGoals?.length ?? 0}
                open={openSections.has('hypotheticalGoals')}
                onToggle={() => toggleSection('hypotheticalGoals')}
              >
                <HypotheticalGoalOverrides
                  value={liveOverrides.hypotheticalGoals}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, hypotheticalGoals: next }))}
                />
              </OverrideSection>
              <OverrideSection
                label="Existing goal edits"
                count={liveOverrides.goalTargetEdits?.length ?? 0}
                open={openSections.has('goalTargetEdits')}
                onToggle={() => toggleSection('goalTargetEdits')}
              >
                <GoalTargetOverrides
                  value={liveOverrides.goalTargetEdits}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, goalTargetEdits: next }))}
                  realGoals={history.goals}
                />
              </OverrideSection>
              <OverrideSection
                label="Skip recurring"
                count={liveOverrides.skipRecurringInstances?.length ?? 0}
                open={openSections.has('skipRecurring')}
                onToggle={() => toggleSection('skipRecurring')}
              >
                <SkipRecurringOverrides
                  value={liveOverrides.skipRecurringInstances}
                  onChange={(next) => setLiveOverrides((o) => ({ ...o, skipRecurringInstances: next }))}
                  baseStreams={history.recurringStreams}
                  availableMonths={availableMonths}
                />
              </OverrideSection>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <ChartRangeTabs range={range} onChange={setRange} />
              </div>
              <ForecastChart
                baseline={baselineResult.projection}
                scenario={engineResult.projection}
                markers={chartMarkers}
                range={range}
                showScenario={true}
                subtitle={subtitle}
                freshnessHeadline={freshness.headline}
                freshnessCaveat={freshness.caveat}
              />
              <ScenarioCards
                scenarios={scenarios}
                selectedScenarioId={selectedScenarioId}
                liveOverrides={liveOverrides}
                baselineEndCash={baselineResult.projection[lastVisible]?.endCash ?? 0}
                scenarioEndCash={horizonProjected}
                baselineLabel={`Projected ${horizonMonth} · no overrides`}
                scenarioLabel={selectedScenario?.name ?? null}
                onSelect={handleSelectScenario}
              />
              <GoalImpacts goalImpacts={engineResult.goalImpacts} />
            </div>
          </div>
        </div>
      )}

      {view === 'comparison' && (
        <MobileScenarioSaveBar
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          liveOverrides={liveOverrides}
          isDirty={isDirty}
          onSelect={handleSelectScenario}
        />
      )}
    </div>
  );
}
