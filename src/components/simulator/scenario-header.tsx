'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createScenario,
  deleteScenario,
  updateScenario,
} from '@/lib/forecast/scenario-actions';
import type { Scenario } from '@/lib/db/schema';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  scenarios: Scenario[];
  selectedScenarioId: string | null;
  liveOverrides: ScenarioOverrides;
  isDirty: boolean;
  onSelect: (id: string | null) => void;
};

/**
 * Top-of-page header. Scenario name + selector + actions.
 *
 * Save semantics:
 *   - If no scenario is selected (baseline): prompt for a name, createScenario.
 *   - If a scenario is selected and dirty: updateScenario in place.
 *   - If not dirty: button is visually disabled but page allows (no harm in a no-op).
 *
 * After any mutation, router.refresh() re-fetches the scenarios list from
 * the server component. selectedScenarioId is preserved (or set to the
 * just-created id).
 */
export function ScenarioHeader({
  scenarios,
  selectedScenarioId,
  liveOverrides,
  isDirty,
  onSelect,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  const handleSave = () => {
    startTransition(async () => {
      if (!selected) {
        // Create a new scenario
        const name = window.prompt('Name this scenario:', 'Untitled scenario');
        if (!name) return;
        const result = await createScenario({ name, overrides: liveOverrides });
        if (result.ok) {
          onSelect(result.data.id);
          router.refresh();
        } else {
          window.alert(`Save failed: ${result.error}`);
        }
      } else {
        const result = await updateScenario({
          id: selected.id,
          overrides: liveOverrides,
        });
        if (result.ok) {
          router.refresh();
        } else {
          window.alert(`Save failed: ${result.error}`);
        }
      }
    });
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete scenario "${selected.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selected.id });
      if (result.ok) {
        onSelect(null);
        router.refresh();
      } else {
        window.alert(`Delete failed: ${result.error}`);
      }
    });
  };

  const handleReset = () => {
    onSelect(selectedScenarioId); // re-selecting the current scenario reloads its saved overrides
  };

  return (
    <header className="flex items-baseline justify-between mb-8 pb-4 border-b border-border">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          Simulator
        </div>
        <div className="flex items-baseline gap-2 mt-1 text-sm text-muted-foreground">
          <select
            value={selectedScenarioId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="bg-transparent border-0 -ml-1 px-1 py-0 hover:bg-accent rounded cursor-pointer"
            disabled={isPending}
          >
            <option value="">Baseline (no overrides)</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isDirty && <span className="text-amber-600">· edited</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          disabled={!isDirty || isPending}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : selected ? 'Save' : 'Save as…'}
        </button>
        {selected && (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </header>
  );
}
