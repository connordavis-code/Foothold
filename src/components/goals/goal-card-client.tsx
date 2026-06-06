'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import type { CoachingOutput } from '@/lib/goals/coaching';
import type { PaceVerdict } from '@/lib/goals/pace';
import type { MoveSuggestion } from '@/lib/goals/move-suggestions';
import type { GoalMove } from '@/lib/db/schema';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { AttachedMoveRow } from '@/components/moves/attached-move-row';
import { SuggestionChip } from '@/components/moves/suggestion-chip';
import { MoveDrawer } from '@/components/moves/move-drawer';

type GoalCardClientProps = {
  goal: GoalWithProgress;
  verdict: PaceVerdict;
  coaching: CoachingOutput | null;
  attachedMoves: GoalMove[];
  driftSuggestions: MoveSuggestion[];
  hikeSuggestions: MoveSuggestion[];
  streams: RecurringStreamRow[];
  categories: { key: string; label: string }[];
};

// Stable key for the MoveDrawer so React remounts MoveEditor when prefill
// changes — prevents stale useState inside MoveEditor when a different
// SuggestionChip is clicked after a cancel (T10 quality-review bug class).
function makePrefillKey(
  prefill: { templateKey: string; params: Record<string, unknown> } | null,
): string {
  if (!prefill) return 'no-prefill';
  // Inline stable-ish stringify: same insertion order per construction path,
  // which is consistent for params objects produced by the suggestion helpers.
  return `${prefill.templateKey}::${JSON.stringify(prefill.params)}`;
}

export function GoalCardClient({
  goal,
  verdict,
  coaching,
  attachedMoves,
  driftSuggestions,
  hikeSuggestions,
  streams,
  categories,
}: GoalCardClientProps) {
  // Behind-pace goals start expanded so moves surface by default (SPEC Decision #5).
  // Per-mount only — no localStorage. State survives revalidate re-renders because
  // this component stays mounted; React preserves instance state across prop updates.
  const [expanded, setExpanded] = useState(() => verdict === 'behind');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefill, setPrefill] = useState<{
    templateKey: string;
    params: Record<string, unknown>;
  } | null>(null);
  // Tracks origin for SPEC Decision #7 source field on the attached move.
  const [source, setSource] = useState<'manual' | 'drift' | 'hike'>('manual');

  const prefillKey = makePrefillKey(prefill);
  const title = `Add a Move to ${goal.name}`;

  function handleAddSuggestion(suggestion: MoveSuggestion) {
    setPrefill({ templateKey: suggestion.templateKey, params: suggestion.params });
    setSource(suggestion.source);
    setDrawerOpen(true);
  }

  function handleEditMove(move: GoalMove) {
    // KNOWN C1 LIMITATION: this opens MoveDrawer in attach-mode, not update-mode.
    // The submit path calls attachGoalMoveAction, NOT updateGoalMoveAction.
    // Behavior consequences:
    //   - If user submits unchanged params: findDuplicateMove returns the existing
    //     row's id (idempotent no-op). Safe.
    //   - If user submits CHANGED params: a NEW goal_move row inserts with the
    //     new params; the ORIGINAL row stays attached. User now sees both rows.
    // Proper fix requires plumbing `editingMoveId` through MoveEditor (T10) +
    // MoveDrawer (T11) so handleFormSubmit branches to updateGoalMoveAction
    // when editing. Deferred from C1 to a follow-up commit.
    setPrefill({ templateKey: move.templateKey, params: move.params as Record<string, unknown> });
    setSource('manual');
    setDrawerOpen(true);
  }

  function handleAdded(_moveId: string) {
    setDrawerOpen(false);
    setPrefill(null);
    // revalidatePath('/goals') fires inside the server action; new move appears
    // in attachedMoves on next render without this component remounting.
  }

  return (
    <>
      {/* Compact branch — coaching sentence is the click target. */}
      {/* No "0 moves" pill per SPEC Decision #5. */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 block w-full cursor-pointer rounded-md border-t border-[--hairline] pt-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {coaching ? (
            <div>
              <p className="text-sm italic text-[--text-2]">{coaching.status}</p>
              {coaching.action && (
                <p className="mt-1 text-sm italic text-[--text-2]">{coaching.action}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[--text-3]">Add a move to track progress →</p>
          )}
        </button>
      )}

      {/* Expanded branch — moves list, then suggestions, then Add Move. */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-[--hairline] pt-4">
          {/* Show coaching sentence at top of expanded region for context. */}
          {coaching && (
            <div>
              <p className="text-sm italic text-[--text-2]">{coaching.status}</p>
              {coaching.action && (
                <p className="mt-1 text-sm italic text-[--text-2]">{coaching.action}</p>
              )}
            </div>
          )}

          {/* Attached moves — user's existing commitments first. */}
          {attachedMoves.length > 0 && (
            <ul className="space-y-2">
              {attachedMoves.map((m) => (
                <AttachedMoveRow
                  key={m.id}
                  move={m}
                  streams={streams}
                  categories={categories}
                  onEdit={handleEditMove}
                />
              ))}
            </ul>
          )}

          {/* Drift chips — auto-detected spend drift signals. */}
          {driftSuggestions.length > 0 && (
            <div className="space-y-2">
              {driftSuggestions.map((s, i) => (
                <SuggestionChip
                  key={`drift-${i}`}
                  suggestion={s}
                  onAdd={handleAddSuggestion}
                />
              ))}
            </div>
          )}

          {/* Hike chips — auto-detected stream price increases. */}
          {hikeSuggestions.length > 0 && (
            <div className="space-y-2">
              {hikeSuggestions.map((s, i) => (
                <SuggestionChip
                  key={`hike-${i}`}
                  suggestion={s}
                  onAdd={handleAddSuggestion}
                />
              ))}
            </div>
          )}

          {/* Add Move — manual fallback, always visible in expanded region. */}
          <button
            type="button"
            onClick={() => {
              setPrefill(null);
              setSource('manual');
              setDrawerOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-md border border-[--hairline] px-3 py-1.5 text-sm text-[--text-2] transition-colors hover:border-[--text-3] hover:text-[--text] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--text-3]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add a Move
          </button>
        </div>
      )}

      {/* MoveDrawer — keyed on prefillKey so MoveEditor remounts when prefill
          changes. Prevents stale useState when the user cancels one suggestion
          and immediately opens a different one with the same templateKey. */}
      <MoveDrawer
        key={prefillKey}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={title}
        context={{ kind: 'goal', goalId: goal.id }}
        streams={streams}
        categories={categories}
        prefill={
          prefill
            ? { templateKey: prefill.templateKey as 'reduce-category' | 'adjust-recurring', params: prefill.params }
            : undefined
        }
        source={source}
        onAttached={handleAdded}
      />
    </>
  );
}
