'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { ForecastChart } from '@/components/simulator/forecast-chart';
import { GoalDiffMatrix } from '@/components/simulator/goal-diff-matrix';
import { ScenarioDeltaCards } from '@/components/simulator/scenario-delta-cards';
import { ScenarioPicker } from '@/components/simulator/scenario-picker';
import type { Scenario } from '@/lib/db/schema';
import { pickScenarioColor } from '@/lib/forecast/comparison';
import { projectCash } from '@/lib/forecast/engine';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  history: ForecastHistory;
  scenarios: Scenario[];
  currentMonth: string;
  initialSelectedIds: string[];
};

/**
 * Client owner of the compare view. Keeps URL as the source of truth for
 * picker state — selection is round-tripped through `?scenarios=...` so
 * the comparison is shareable + bookmark-able + back-button-correct.
 *
 * Engine runs are pure and memoized: baseline once, plus one projectCash
 * per selected scenario. With max 3 scenarios + baseline, that's 4 calls
 * total on each picker change — projectCash is microsecond-class so the
 * recompute is invisible.
 */
export function CompareClient({
  history,
  scenarios,
  currentMonth,
  initialSelectedIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Re-derive selectedIds from URL each render so the back/forward buttons
  // correctly restore picker state. Server provides initialSelectedIds for
  // the first render (avoids a flash); subsequent navigation updates the
  // URL and we read from searchParams.
  const selectedIds = useMemo(() => {
    const raw = searchParams.get('scenarios');
    if (!raw) return initialSelectedIds;
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  }, [searchParams, initialSelectedIds]);

  const setSelectedIds = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.length === 0) {
        params.delete('scenarios');
      } else {
        params.set('scenarios', next.join(','));
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

  // Per-scenario engine results. Carries the full `goalImpacts` so the
  // matrix can compose without re-running projectCash.
  const scenarioResults = useMemo(() => {
    return selectedIds.map((id, idx) => {
      const scn = scenarios.find((s) => s.id === id);
      if (!scn) return null;
      const overrides = scn.overrides as ScenarioOverrides;
      const result = projectCash({ history, overrides, currentMonth });
      return {
        id: scn.id,
        name: scn.name,
        projection: result.projection,
        goalImpacts: result.goalImpacts,
        colorVar: pickScenarioColor(idx),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [selectedIds, scenarios, history, currentMonth]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
      <header className="space-y-1.5 border-b border-border pb-4">
        <p className="text-eyebrow">Plan</p>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Compare scenarios
          </h1>
          <Link
            href="/simulator"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← back to Simulator
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Overlay up to 3 saved scenarios on the baseline forecast.
        </p>
      </header>

      <ScenarioPicker
        scenarios={scenarios}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />

      {selectedIds.length === 0 && scenarios.length > 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface-elevated px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Select scenarios above to overlay them on the baseline forecast.
          </p>
        </div>
      ) : (
        <>
          <ForecastChart baseline={baseline} scenarios={scenarioResults} />
          <ScenarioDeltaCards baseline={baseline} scenarios={scenarioResults} />
          <GoalDiffMatrix scenarios={scenarioResults} />
        </>
      )}
    </div>
  );
}
