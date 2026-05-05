'use client';

import { cn } from '@/lib/utils';

export type GroupBy = 'flat' | 'account' | 'type';

const OPTIONS: Array<{ id: GroupBy; label: string }> = [
  { id: 'flat', label: 'Flat' },
  { id: 'account', label: 'Account' },
  { id: 'type', label: 'Asset type' },
];

type Props = {
  value: GroupBy;
  onChange: (next: GroupBy) => void;
};

/**
 * Three-state pill toggle. Segmented control rather than a dropdown
 * because the values are small in number and worth showing at all
 * times — dropdown would hide the affordance.
 */
export function GroupByToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Group holdings by"
      className="inline-flex items-center gap-0 rounded-pill border border-border bg-surface-elevated p-0.5"
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            className={cn(
              'rounded-pill px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out-quart',
              isActive
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
