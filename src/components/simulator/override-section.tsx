'use client';

import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  label: string;
  count: number;             // active items in this section (badge)
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * Collapsible override section. Fully controlled — open state lives
 * in the parent so the simulator can dispatch single-open accordion
 * behavior on mobile (auto-collapse siblings when one opens) while
 * keeping independent multi-open on desktop. See SimulatorClient's
 * `toggleSection` for the breakpoint-aware dispatcher.
 */
export function OverrideSection({
  label,
  count,
  open,
  onToggle,
  children,
}: Props) {
  const isEmpty = count === 0;

  return (
    <div className="border-b border-border/60 py-2.5">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between text-sm transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5 text-foreground">
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          />
          {label}
        </span>
        <span className={isEmpty ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
          {isEmpty ? '—' : count}
        </span>
      </button>
      {open && <div className="mt-3 pl-5 text-sm">{children}</div>}
    </div>
  );
}
