'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  label: string;
  count: number;             // active items in this section (badge)
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Collapsible section with header showing label + active-item count.
 * Uses local useState for expanded; no global accordion coordination
 * (each section opens independently — reader can compare two simultaneously).
 *
 * Visual: bottom border separator, lightweight chrome. Matches the
 * "balanced v3" mockup quietness — no heavy backgrounds, just a thin
 * accent on the active state.
 */
export function OverrideSection({
  label,
  count,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const isEmpty = count === 0;

  return (
    <div className="border-b border-border/60 py-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-sm hover:text-foreground transition-colors"
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
