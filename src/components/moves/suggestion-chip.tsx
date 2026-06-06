'use client';

import { TrendingUp, ArrowUpRight } from 'lucide-react';
import type { MoveSuggestion } from '@/lib/goals/move-suggestions';

type SuggestionChipProps = {
  suggestion: MoveSuggestion;
  /**
   * Parent receives the full suggestion (not just templateKey + params) so it
   * can forward `source` into the MoveDrawer's `source` prop, preserving
   * drift/hike origin tracking for SPEC Decision #7's source field.
   */
  onAdd: (suggestion: MoveSuggestion) => void;
};

export function SuggestionChip({ suggestion, onAdd }: SuggestionChipProps): JSX.Element {
  const Icon = suggestion.source === 'drift' ? TrendingUp : ArrowUpRight;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <Icon aria-hidden className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="flex-1 text-foreground">{suggestion.displayCopy}</span>
      <button
        type="button"
        onClick={() => onAdd(suggestion)}
        className="flex-shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Add: ${suggestion.displayCopy}`}
      >
        Add
      </button>
    </div>
  );
}
