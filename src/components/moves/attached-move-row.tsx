'use client';

import { useState } from 'react';
import { Pencil, X, RefreshCw, TrendingDown, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { detachGoalMoveAction } from '@/lib/moves/actions';
import { formatCurrencyCompact } from '@/lib/utils';
import type { GoalMove } from '@/lib/db/schema';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

type AttachedMoveRowProps = {
  move: GoalMove;
  streams: RecurringStreamRow[];
  categories: { key: string; label: string }[];
  onEdit: (move: GoalMove) => void;
};

/**
 * Generates a human-readable one-line summary of a goal move.
 * Handles all four template types with proper fallback to "(unknown)" labels.
 */
function formatMoveSummary(
  move: GoalMove,
  streams: RecurringStreamRow[],
  categories: { key: string; label: string }[],
): string {
  const params = move.params as Record<string, unknown>;

  // Month formatter: YYYY-MM → "Jan 2026"
  const formatMonth = (monthStr: string): string => {
    const [year, month] = monthStr.split('-');
    const date = new Date(`${year}-${month}-01`);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const startMonth = formatMonth(typeof params.startMonth === 'string' ? params.startMonth : '');
  const endMonth =
    typeof params.endMonth === 'string' ? formatMonth(params.endMonth) : undefined;

  const endWindow = endMonth ? ` to ${endMonth}` : '';

  if (move.templateKey === 'adjust-recurring') {
    const streamId = typeof params.streamId === 'string' ? params.streamId : undefined;
    const newAmount = typeof params.newAmount === 'number' ? params.newAmount : 0;

    const stream = streamId ? streams.find((s) => s.id === streamId) : undefined;
    const streamName = stream?.merchantName || stream?.description || '(unknown stream)';

    return `Adjust ${streamName} to ${formatCurrencyCompact(newAmount)}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'reduce-category') {
    const categoryKey = typeof params.categoryKey === 'string' ? params.categoryKey : undefined;
    const deltaAmount = typeof params.deltaAmount === 'number' ? params.deltaAmount : 0;

    const category = categoryKey ? categories.find((c) => c.key === categoryKey) : undefined;
    const categoryLabel = category?.label || '(unknown category)';

    return `Reduce ${categoryLabel} by ${formatCurrencyCompact(deltaAmount)}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'income-event') {
    const monthlyAmount =
      typeof params.monthlyAmount === 'number' ? params.monthlyAmount : 0;
    const label = typeof params.label === 'string' ? params.label : 'Income event';

    const sign = monthlyAmount >= 0 ? '+' : '';
    const amount = `${sign}${formatCurrencyCompact(monthlyAmount)}`;

    return `${label}: ${amount}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'skip-once') {
    const streamId = typeof params.streamId === 'string' ? params.streamId : undefined;
    const month = typeof params.month === 'string' ? params.month : '';

    const stream = streamId ? streams.find((s) => s.id === streamId) : undefined;
    const streamName = stream?.merchantName || stream?.description || '(unknown stream)';

    return `Skip ${streamName} in ${formatMonth(month)}`;
  }

  return 'Unknown move';
}

/**
 * Icon for a template key.
 */
function getTemplateIcon(templateKey: string) {
  switch (templateKey) {
    case 'adjust-recurring':
      return RefreshCw;
    case 'reduce-category':
      return TrendingDown;
    case 'income-event':
      return Banknote;
    case 'skip-once':
      return RefreshCw;
    default:
      return RefreshCw;
  }
}

/**
 * Renders one row in the inline moves list.
 * Shows: template icon + summary text + detach button + edit button.
 * Edit button emits via onEdit callback; parent owns the MoveDrawer state.
 * Detach is immediate (no dialog) per SPEC Decision #1.
 */
export function AttachedMoveRow({
  move,
  streams,
  categories,
  onEdit,
}: AttachedMoveRowProps) {
  const [busy, setBusy] = useState(false);

  const summary = formatMoveSummary(move, streams, categories);
  const IconComponent = getTemplateIcon(move.templateKey);

  const handleDetach = async () => {
    // Per SPEC Decision #1, detach is intentionally immediate — no confirm dialog.
    setBusy(true);
    const result = await detachGoalMoveAction(move.id);
    setBusy(false);

    if (!result.ok) {
      toast.error('Could not detach move');
    }
    // Success: page revalidation re-renders without this row; no extra UI needed.
  };

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      {/* Template icon */}
      <IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

      {/* Summary text */}
      <span className="flex-1 text-foreground">{summary}</span>

      {/* Edit button */}
      <button
        type="button"
        onClick={() => onEdit(move)}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Edit move"
        disabled={busy}
      >
        <Pencil className="h-4 w-4" />
      </button>

      {/* Detach button */}
      <button
        type="button"
        onClick={handleDetach}
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Detach move"
        disabled={busy}
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
