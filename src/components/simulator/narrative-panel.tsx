'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  generateForecastNarrativeAction,
  lookupForecastNarrative,
} from '@/lib/forecast/narrative-actions';
import type { ScenarioOverrides } from '@/lib/forecast/types';

// isDirty: cache key is keyed on saved-and-stable overrides shape; dirty
// unsaved state would pollute the cache with a transient overrides snapshot.
type Props = {
  scenarioId: string | null;
  overrides: ScenarioOverrides;
  isDirty: boolean;
  hasOverrides: boolean;
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'has-narrative'; narrative: string; generatedAt: Date; isStale: boolean }
  | { kind: 'error'; message: string };

export function NarrativePanel({ scenarioId, overrides, isDirty, hasOverrides }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  // JSON.stringify(overrides) in the deps array is intentional — overrides is a
  // plain object that React would treat as a new identity each render even if
  // values are unchanged, so we serialize for stable dependency comparison.
  // A deep-equal hook would work too, but is overkill for the panel's update frequency.
  useEffect(() => {
    if (!scenarioId || !hasOverrides || isDirty) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    lookupForecastNarrative({ scenarioId, overrides })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: 'error', message: result.error });
          return;
        }
        if (result.data) {
          setState({
            kind: 'has-narrative',
            narrative: result.data.narrative,
            generatedAt: result.data.generatedAt,
            isStale: false,
          });
        } else {
          setState({ kind: 'idle' });
        }
      })
      // Server actions normally return {ok:false} on errors, but a network/
      // runtime rejection (timeout, server unreachable) would otherwise leave
      // the panel stuck in 'loading' forever.
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Lookup failed',
        });
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, hasOverrides, isDirty, JSON.stringify(overrides)]);

  if (!hasOverrides || !scenarioId) {
    return null;
  }

  const handleGenerate = (force: boolean) => {
    if (!scenarioId) return;
    startTransition(async () => {
      setState({ kind: 'loading' });
      const result = await generateForecastNarrativeAction({
        scenarioId,
        overrides,
        force,
      });
      if (!result.ok) {
        setState({ kind: 'error', message: result.error });
        return;
      }
      setState({
        kind: 'has-narrative',
        narrative: result.data.narrative,
        generatedAt: new Date(result.data.generatedAt),
        isStale: result.data.isStale,
      });
    });
  };

  return (
    <section className="bg-muted/40 border border-border/60 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Summary
        </div>
        {state.kind === 'has-narrative' && (
          <button
            onClick={() => handleGenerate(true)}
            disabled={isPending || isDirty}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            regenerate
          </button>
        )}
      </div>

      {isDirty && (
        <p className="text-sm text-muted-foreground italic">
          Save the scenario to enable AI summary.
        </p>
      )}

      {!isDirty && state.kind === 'idle' && (
        <button
          onClick={() => handleGenerate(false)}
          disabled={isPending}
          className="text-sm text-foreground bg-background border border-border rounded px-3 py-1.5 hover:bg-accent disabled:opacity-50"
        >
          Generate AI summary
        </button>
      )}

      {!isDirty && state.kind === 'loading' && (
        <p className="text-sm text-muted-foreground">Generating…</p>
      )}

      {!isDirty && state.kind === 'has-narrative' && (
        <>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {state.narrative}
          </p>
          {state.isStale && (
            <p className="text-[11px] text-amber-600 mt-2">
              Couldn&apos;t refresh — using cached version from{' '}
              {state.generatedAt.toLocaleDateString()}.
            </p>
          )}
        </>
      )}

      {!isDirty && state.kind === 'error' && (
        <>
          <p className="text-sm text-destructive">Couldn&apos;t generate a summary for this scenario.</p>
          <p className="text-[11px] text-muted-foreground mt-1">{state.message}</p>
          <button
            onClick={() => handleGenerate(false)}
            disabled={isPending}
            className="text-[11px] text-muted-foreground hover:text-foreground mt-2 underline disabled:opacity-50"
          >
            try again
          </button>
        </>
      )}
    </section>
  );
}
