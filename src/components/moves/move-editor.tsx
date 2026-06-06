'use client';

import { useState } from 'react';
import { attachGoalMoveAction, attachScenarioMoveAction } from '@/lib/moves/actions';
import { MovePickerTiles } from './move-picker-tiles';
import { MoveForm, type MoveFormValues, type CategoryOption } from './move-form';
import type { MoveTemplateKey } from '@/lib/moves/validation';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

// =============================================================================
// Public types
// =============================================================================

/**
 * Context discriminates goal-side vs simulator-side submit targets.
 * Mirrors SPEC.md:157-160.
 */
export type MoveEditorContext =
  | { kind: 'goal'; goalId: string }
  | { kind: 'scenario'; scenarioId: string };

export type { CategoryOption };

type Props = {
  context: MoveEditorContext;
  streams: RecurringStreamRow[];
  categories: CategoryOption[];
  /** Pre-fills a specific template + params (e.g. from a SuggestionChip). */
  prefill?: { templateKey: MoveTemplateKey; params: Record<string, unknown> };
  /**
   * Forwarded into the attach call as `source`.
   * Goal context only — scenario moves don't carry a source field.
   */
  source?: 'manual' | 'drift' | 'hike';
  /** Called with the new moveId after a successful attach. */
  onAttached?: (moveId: string) => void;
  /** For the parent to close the containing drawer/sheet. */
  onCancel?: () => void;
};

// =============================================================================
// MoveEditor
// =============================================================================

/**
 * Combines <MovePickerTiles> and <MoveForm> into a two-step editor.
 *
 * Step 1: picker shows available templates.
 * Step 2: form renders fields for the selected template.
 *
 * Context dispatch lives here — <MoveForm> receives an onSubmit callback
 * that internally routes to the correct server action without knowing which
 * context it's in. RSC constraint is satisfied: only string/data props
 * reach the client tree from the server; all functions live client-side.
 */
export function MoveEditor({
  context,
  streams,
  categories,
  prefill,
  source = 'manual',
  onAttached,
  onCancel,
}: Props) {
  const [activeKey, setActiveKey] = useState<MoveTemplateKey | null>(
    prefill?.templateKey ?? null,
  );

  // When the user clicks a different tile while a form is already shown,
  // reset to the newly selected template (clear any in-progress form state
  // by remounting MoveForm via the key prop).
  function handleTileSelect(key: MoveTemplateKey) {
    setActiveKey(key);
  }

  // Context-aware submit — dispatches to the right server action.
  // MoveForm calls this with a typed MoveFormValues; we unwrap and forward.
  async function handleFormSubmit(
    values: MoveFormValues,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (context.kind === 'goal') {
      const input =
        values.templateKey === 'skip-once'
          ? // skip-once is rejected by goalMoveInputSchema — this branch is
            // unreachable in goal context (tile is hidden), but TypeScript
            // needs the narrowing to be exhaustive.
            null
          : {
              templateKey: values.templateKey,
              params: values.params,
              goalId: context.goalId,
              source,
            };

      if (!input) {
        return { ok: false, error: 'skip-once is not valid for goal moves' };
      }

      const result = await attachGoalMoveAction(input);
      if (result.ok) {
        onAttached?.(result.data.moveId);
      }
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    } else {
      // scenario context
      const input = {
        templateKey: values.templateKey,
        params: values.params,
        scenarioId: context.scenarioId,
      };

      // attachScenarioMoveAction is a stub in C1 — it throws "not yet
      // implemented". Callers in C1 (T11 MoveDrawer on /simulator) should
      // not be wired until C2. The throw propagates as an error string.
      try {
        const result = await (attachScenarioMoveAction as (i: unknown) => Promise<{ ok: true; data: { moveId: string } } | { ok: false; error: string }>)(input);
        if (result.ok) {
          onAttached?.(result.data.moveId);
        }
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scenario moves not yet implemented';
        return { ok: false, error: msg };
      }
    }
  }

  const allowSkipOnce = context.kind === 'scenario';

  return (
    <div className="flex flex-col gap-5">
      <MovePickerTiles
        allowSkipOnce={allowSkipOnce}
        activeKey={activeKey}
        onSelect={handleTileSelect}
      />

      {activeKey && (
        // key={activeKey} forces a full remount when the template changes,
        // resetting all field state without manual cleanup.
        <MoveForm
          key={activeKey}
          templateKey={activeKey}
          streams={streams}
          categories={categories}
          prefillParams={prefill?.templateKey === activeKey ? prefill.params : undefined}
          onSubmit={handleFormSubmit}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
