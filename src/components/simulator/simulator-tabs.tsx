'use client';

import type { ViewParam } from '@/lib/simulator/url-state';
import { cn } from '@/lib/utils';

type Props = {
  view: ViewParam;
  onChange: (v: ViewParam) => void;
};

const TABS: { value: ViewParam; label: string }[] = [
  { value: 'empty', label: 'Empty' },
  { value: 'moves', label: 'Moves' },
  { value: 'comparison', label: 'Comparison' },
];

export function SimulatorTabs({ view, onChange }: Props) {
  return (
    <div className="mb-6 inline-flex gap-1 border-b border-hairline">
      {TABS.map((t) => {
        const active = t.value === view;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'relative px-3 py-2 text-sm transition-colors',
              active ? 'text-foreground' : 'text-text-2 hover:text-foreground',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 -translate-x-3 h-1.5 w-1.5 rounded-full"
                style={{ background: 'hsl(var(--accent))' }}
              />
            )}
            <span className={cn(active && 'pl-3')}>{t.label}</span>
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-px left-0 right-0 h-[2px]"
                style={{ background: 'hsl(var(--accent))' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
