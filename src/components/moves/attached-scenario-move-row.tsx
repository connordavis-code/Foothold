'use client';

import { useState } from 'react';
import { X, RefreshCw, TrendingDown, Banknote, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { detachScenarioMoveAction } from '@/lib/moves/actions';
import { formatMoveSummary } from '@/lib/moves/summary';
import type { ScenarioMove } from '@/lib/db/schema';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

type Props = {
  move: ScenarioMove;
  streams: RecurringStreamRow[];
  categories: { key: string; label: string }[];
};

function getTemplateIcon(templateKey: string) {
  switch (templateKey) {
    case 'adjust-recurring':
      return RefreshCw;
    case 'reduce-category':
      return TrendingDown;
    case 'income-event':
      return Banknote;
    case 'skip-once':
      return SkipForward;
    default:
      return RefreshCw;
  }
}

/**
 * One row in the simulator's attached-scenario-moves list. Mirrors
 * <AttachedMoveRow> but with no edit pencil: scenario moves are ephemeral
 * exploration, so "edit" is detach + re-add. Detach writes through immediately
 * via detachScenarioMoveAction (revalidatePath re-renders the mounted client).
 */
export function AttachedScenarioMoveRow({ move, streams, categories }: Props) {
  const [busy, setBusy] = useState(false);

  const summary = formatMoveSummary(move, streams, categories);
  const IconComponent = getTemplateIcon(move.templateKey);

  const handleDetach = async () => {
    setBusy(true);
    const result = await detachScenarioMoveAction(move.id);
    setBusy(false);
    if (!result.ok) {
      toast.error('Could not remove move');
    }
    // Success: revalidatePath('/simulator') re-renders without this row.
  };

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="flex-1 text-foreground">{summary}</span>
      <button
        type="button"
        onClick={handleDetach}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Remove move"
        disabled={busy}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
