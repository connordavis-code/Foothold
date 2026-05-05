'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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

type Toast = { kind: 'success' | 'error'; message: string };

/**
 * Top-of-page header. Scenario name + selector + actions.
 *
 * Save semantics:
 *   - No scenario selected (baseline): inline name input → createScenario.
 *   - Scenario selected and dirty: updateScenario in place.
 *   - Save flow stays inline (no window.prompt / alert).
 *
 * After mutation, router.refresh() re-fetches the scenarios list. The Save
 * button doubles as a Cmd/Ctrl+S target via the document keydown listener.
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? null;

  // Auto-dismiss the toast after 3s. Re-runs whenever a new toast arrives.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Focus the name input the moment it appears so the user can just type.
  useEffect(() => {
    if (nameDraft !== null) nameInputRef.current?.focus();
  }, [nameDraft]);

  const persistUpdate = (id: string) => {
    startTransition(async () => {
      const result = await updateScenario({ id, overrides: liveOverrides });
      if (result.ok) {
        setToast({ kind: 'success', message: 'Saved.' });
        router.refresh();
      } else {
        setToast({ kind: 'error', message: result.error });
      }
    });
  };

  const persistCreate = (name: string) => {
    if (!name.trim()) {
      setToast({ kind: 'error', message: 'Name can’t be empty.' });
      return;
    }
    startTransition(async () => {
      const result = await createScenario({ name: name.trim(), overrides: liveOverrides });
      if (result.ok) {
        setToast({ kind: 'success', message: `Saved “${name.trim()}.”` });
        setNameDraft(null);
        onSelect(result.data.id);
        router.refresh();
      } else {
        setToast({ kind: 'error', message: result.error });
      }
    });
  };

  const handleSave = () => {
    if (!isDirty || isPending) return;
    if (selected) {
      persistUpdate(selected.id);
    } else {
      // Open the inline name editor instead of window.prompt.
      setNameDraft('');
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete scenario "${selected.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteScenario({ id: selected.id });
      if (result.ok) {
        setToast({ kind: 'success', message: 'Deleted.' });
        onSelect(null);
        router.refresh();
      } else {
        setToast({ kind: 'error', message: result.error });
      }
    });
  };

  const handleReset = () => {
    onSelect(selectedScenarioId);
  };

  // Cmd/Ctrl+S triggers Save. Listen at document level so the shortcut works
  // regardless of which input has focus inside the simulator page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
      if (!isSave) return;
      e.preventDefault();
      handleSave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // handleSave closes over isDirty/isPending/selected/liveOverrides, but
    // re-binding the listener on every keystroke would churn document
    // listeners. Reading current values via refs is overkill for this scope —
    // just re-bind on the deps that change save targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending, selected?.id, liveOverrides]);

  return (
    <header className="flex items-baseline justify-between mb-6 md:mb-8 pb-4 border-b border-border relative">
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
          {isDirty && (
            <span className="text-amber-600 font-medium">· unsaved changes</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {nameDraft !== null ? (
          // Inline name editor — replaces window.prompt for new scenarios.
          <form
            onSubmit={(e) => {
              e.preventDefault();
              persistCreate(nameDraft);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNameDraft(null);
              }}
              placeholder="Scenario name"
              maxLength={120}
              className="text-sm bg-background border border-border rounded-md px-2 py-1.5 text-foreground w-48"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending}
              className="bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setNameDraft(null)}
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
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
              title={selected ? 'Save (⌘S)' : 'Save as new scenario (⌘S)'}
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
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className={`absolute top-full right-0 mt-2 px-3 py-2 rounded-md text-sm shadow-md transition-opacity ${
            toast.kind === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {toast.message}
        </div>
      )}
    </header>
  );
}
