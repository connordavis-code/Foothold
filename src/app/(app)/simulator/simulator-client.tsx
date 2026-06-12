'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import type { Scenario, GoalMove, ScenarioMove } from '@/lib/db/schema';
import { projectCash } from '@/lib/forecast/engine';
import type { FreshnessText } from '@/lib/format/freshness';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import {
  goalMovesToEngineMoves,
  scenarioMovesToEngineMoves,
} from '@/lib/moves/apply';
import type { RangeParam } from '@/lib/simulator/url-state';
import { deriveChartMarkers } from '@/lib/simulator/markers';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { createScenario, deleteScenario } from '@/lib/forecast/scenario-actions';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { ChartRangeTabs } from '@/components/simulator/chart-range-tabs';
import { ScenarioPicker } from '@/components/simulator/scenario-picker';
import { GoalImpactsStrip } from '@/components/simulator/goal-impacts-strip';
import { MoveDrawer } from '@/components/moves/move-drawer';
import { AttachedScenarioMoveRow } from '@/components/moves/attached-scenario-move-row';

// Stable empty-overrides reference so memo deps don't churn each render.
const EMPTY_OVERRIDES: ScenarioOverrides = {};

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialScenarioId: string | null;
  initialRange: RangeParam;
  freshness: FreshnessText;
  initialGoalMoves: GoalMove[];
  initialScenarioMoves: ScenarioMove[];
  streams: RecurringStreamRow[];
  categories: { key: string; label: string }[];
};

/**
 * R.4 simulator: a minimal, scenario-first what-if sandbox.
 *
 * State collapses to { selectedScenarioId, range, drawerOpen } — no draft, no
 * isDirty. Moves write through immediately to scenario_move (mirror of the
 * /goals path); revalidatePath('/simulator') re-renders this mounted island
 * with fresh server props. A scenario_move can't exist without a parent
 * scenario (FK), so Moves attach only to a selected saved scenario; with zero
 * scenarios the user creates one first.
 *
 * The retained two-store model (T17 DROP COLUMN deferred): a selected
 * scenario's projection overlays BOTH its legacy `overrides` JSON (unmapped
 * capabilities — lump sums, hypotheticals) and its `scenario_move` rows (the
 * four mapped templates). The disjoint-write guard keeps them non-overlapping.
 */
export function SimulatorClient({
  history,
  scenarios,
  currentMonth,
  initialScenarioId,
  initialRange,
  freshness,
  initialGoalMoves,
  initialScenarioMoves,
  streams,
  categories,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // State -----------------------------------------------------------------
  const [range, setRangeState] = useState<RangeParam>(initialRange);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    initialScenarioId,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const selectedScenario =
    scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  // Derived engine inputs -------------------------------------------------
  const engineGoalMoves = useMemo(
    () => goalMovesToEngineMoves(initialGoalMoves),
    [initialGoalMoves],
  );

  // Scenario_move rows for the selected scenario (server-owned; refreshed by
  // revalidatePath after every attach/detach).
  const scenarioMoveRows = useMemo(
    () => initialScenarioMoves.filter((m) => m.scenarioId === selectedScenarioId),
    [initialScenarioMoves, selectedScenarioId],
  );
  const engineScenarioMoves = useMemo(
    () => scenarioMovesToEngineMoves(scenarioMoveRows),
    [scenarioMoveRows],
  );

  const overrides = useMemo<ScenarioOverrides>(
    () => (selectedScenario?.overrides as ScenarioOverrides | undefined) ?? EMPTY_OVERRIDES,
    [selectedScenario],
  );

  const engineResult = useMemo(
    () =>
      projectCash({
        history,
        overrides,
        goalMoves: engineGoalMoves,
        scenarioMoves: engineScenarioMoves,
        currentMonth,
      }),
    [history, overrides, engineGoalMoves, engineScenarioMoves, currentMonth],
  );

  const baselineResult = useMemo(
    () =>
      projectCash({
        history,
        overrides: EMPTY_OVERRIDES,
        goalMoves: engineGoalMoves,
        currentMonth,
      }),
    [history, engineGoalMoves, currentMonth],
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

  // URL mirroring — only range + scenario survive R.4 (view/tab params dropped).
  const pushUrl = useCallback(
    (next: { range?: RangeParam; scenarioId?: string | null }) => {
      const params = new URLSearchParams();
      params.set('range', next.range ?? range);
      const sid = next.scenarioId === undefined ? selectedScenarioId : next.scenarioId;
      if (sid) params.set('scenario', sid);
      router.push(`/simulator?${params.toString()}`, { scroll: false });
    },
    [router, range, selectedScenarioId],
  );

  const setRange = useCallback(
    (nextRange: RangeParam) => {
      setRangeState(nextRange);
      pushUrl({ range: nextRange });
    },
    [pushUrl],
  );

  const handleSelectScenario = useCallback(
    (id: string | null) => {
      // Write-through means nothing is unsaved — no dirty/discard guard needed.
      setSelectedScenarioId(id);
      pushUrl({ scenarioId: id });
    },
    [pushUrl],
  );

  const handleCreateScenario = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createScenario({ name, overrides: {} });
      if (result.ok) {
        toast.success(`Created "${name}"`);
        setNewOpen(false);
        setNewName('');
        setSelectedScenarioId(result.data.id);
        pushUrl({ scenarioId: result.data.id });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDeleteScenario = () => {
    if (!selectedScenarioId) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selectedScenarioId });
      if (result.ok) {
        toast.success('Scenario deleted');
        setSelectedScenarioId(null);
        pushUrl({ scenarioId: null });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  // Empty-data guard ------------------------------------------------------
  const hasNoData =
    history.currentCash === 0 &&
    history.recurringStreams.length === 0 &&
    Object.keys(history.categoryHistory).length === 0;

  const header = (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        <p className="text-eyebrow">Plan</p>
        <h1
          className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
          style={{ letterSpacing: '-0.02em' }}
        >
          Simulator
        </h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ScenarioPicker
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelect={handleSelectScenario}
        />

        <AlertDialog open={newOpen} onOpenChange={setNewOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="default" size="sm" disabled={pending}>
              <Plus className="h-4 w-4" />
              New scenario
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>New scenario</AlertDialogTitle>
              <AlertDialogDescription>
                Name this what-if. Add Moves to it once it&apos;s created.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-2">
              <input
                className="w-full rounded-btn border border-hairline bg-surface px-3 py-2 text-sm"
                placeholder="e.g. Trim recurring"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateScenario();
                }}
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCreateScenario}
                disabled={!newName.trim() || pending}
              >
                Create
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedScenario && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={pending}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes &ldquo;{selectedScenario.name}&rdquo; and its Moves.
                  Your committed goal Moves are unaffected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteScenario}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </header>
  );

  if (hasNoData) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        {header}
        <div className="rounded-card border border-hairline bg-surface p-8 text-center">
          <h2 className="mb-2 text-lg font-medium text-foreground">No data yet</h2>
          <p className="mx-auto max-w-md text-sm text-text-2">
            The simulator forecasts forward from your synced transactions and
            recurring streams. Once Plaid finishes its first sync, the forecast
            will fill in here.
          </p>
        </div>
      </div>
    );
  }

  // Chart subtitle (12mo / 24mo · projected horizon month)
  const lastVisible = range === '1Y' ? 11 : 23;
  const horizonMonth =
    engineResult.projection[lastVisible]?.month ??
    engineResult.projection.at(-1)?.month ??
    '';
  const subtitle = `${range === '1Y' ? '12' : '24'} months · ${horizonMonth} projected`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-12 sm:px-8 sm:py-8 md:pb-8">
      {header}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_1fr] md:gap-10">
        {/* Left rail — scenario Moves (write-through) */}
        <div className="space-y-3">
          <p className="text-eyebrow">Moves</p>
          {selectedScenario ? (
            <>
              {scenarioMoveRows.length > 0 ? (
                <ul className="space-y-2">
                  {scenarioMoveRows.map((m) => (
                    <AttachedScenarioMoveRow
                      key={m.id}
                      move={m}
                      streams={streams}
                      categories={categories}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-3">
                  No Moves yet. Add one to see its effect on the forecast.
                </p>
              )}

              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-[--hairline] px-3 py-1.5 text-sm text-[--text-2] transition-colors hover:border-[--text-3] hover:text-[--text] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--text-3]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add a Move
              </button>
            </>
          ) : (
            <div className="rounded-card border border-hairline bg-surface p-4">
              <p className="text-sm text-text-2">
                {scenarios.length === 0
                  ? 'Create a scenario to start exploring what-ifs.'
                  : 'Select a scenario to add Moves, or create a new one.'}
              </p>
            </div>
          )}
        </div>

        {/* Right — chart + goal impacts */}
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <ChartRangeTabs range={range} onChange={setRange} />
          </div>
          <ForecastChart
            baseline={baselineResult.projection}
            scenario={engineResult.projection}
            markers={chartMarkers}
            range={range}
            showScenario={selectedScenario !== null}
            subtitle={subtitle}
            freshnessHeadline={freshness.headline}
            freshnessCaveat={freshness.caveat}
          />
          {selectedScenario && (
            <GoalImpactsStrip goalImpacts={engineResult.goalImpacts} />
          )}
        </div>
      </div>

      {/* Move attach drawer — scenario context, write-through */}
      {selectedScenario && (
        <MoveDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={`Add a Move to ${selectedScenario.name}`}
          context={{ kind: 'scenario', scenarioId: selectedScenario.id }}
          streams={streams}
          categories={categories}
          onAttached={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
