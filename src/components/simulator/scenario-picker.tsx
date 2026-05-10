'use client';

import Link from 'next/link';
import type { Scenario } from '@/lib/db/schema';
import { MAX_COMPARE_SCENARIOS } from '@/lib/forecast/comparison';
import { cn } from '@/lib/utils';

type Props = {
  scenarios: Scenario[];
  selectedIds: string[];
  /**
   * Called with the next selected-id list. Caller writes this back to the
   * URL (`?scenarios=...`) — picker stays controlled.
   */
  onChange: (next: string[]) => void;
};

/**
 * Chip-toggle picker for the compare view. Each saved scenario is a chip;
 * click toggles it in or out of the comparison. The cap at
 * MAX_COMPARE_SCENARIOS (3) is enforced visually — chips beyond the cap
 * grey out and reject clicks until the user removes one.
 *
 * No scenarios at all → empty-state copy with a link to /simulator. The
 * compare view is useless without saved scenarios; surfacing the path
 * forward beats showing an empty picker.
 */
export function ScenarioPicker({ scenarios, selectedIds, onChange }: Props) {
  if (scenarios.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-elevated px-5 py-6 text-sm text-muted-foreground">
        <p className="mb-2 text-foreground">No saved scenarios yet.</p>
        <p>
          Build one in the{' '}
          <Link
            href="/simulator"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Simulator
          </Link>{' '}
          and click &ldquo;Save as…&rdquo; to keep it for comparison.
        </p>
      </div>
    );
  }

  const atCap = selectedIds.length >= MAX_COMPARE_SCENARIOS;

  const toggle = (id: string) => {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      onChange(selectedIds.filter((x) => x !== id));
    } else if (!atCap) {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow">Scenarios</p>
        <p className="text-[11px] text-muted-foreground">
          {selectedIds.length} of {MAX_COMPARE_SCENARIOS} selected
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => {
          const isSelected = selectedIds.includes(s.id);
          const isDisabled = !isSelected && atCap;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                isSelected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-transparent text-foreground hover:bg-accent',
                isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
              )}
              title={
                isDisabled
                  ? `Remove a selection to add another (max ${MAX_COMPARE_SCENARIOS})`
                  : isSelected
                    ? 'Remove from comparison'
                    : 'Add to comparison'
              }
            >
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
