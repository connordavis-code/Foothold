'use client';

import { useState, useRef, useEffect } from 'react';
import type { Scenario } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

type Props = {
  scenarios: Pick<Scenario, 'id' | 'name'>[];
  selectedScenarioId: string | null;
  onSelect: (id: string | null) => void;
};

export function ScenarioPicker({ scenarios, selectedScenarioId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (scenarios.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-btn border border-hairline px-3 py-1.5 text-sm text-text-2 hover:text-foreground hover:border-text-3"
      >
        Load…
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 rounded-card border border-hairline bg-surface-elevated p-1 shadow-sm"
        >
          <button
            role="menuitem"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={cn(
              'block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-bg-2',
              selectedScenarioId === null && 'text-foreground',
              selectedScenarioId !== null && 'text-text-2',
            )}
          >
            Baseline
          </button>
          {scenarios.map((s) => (
            <button
              key={s.id}
              role="menuitem"
              onClick={() => { onSelect(s.id); setOpen(false); }}
              className={cn(
                'block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-bg-2',
                selectedScenarioId === s.id ? 'text-foreground' : 'text-text-2',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
