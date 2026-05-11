'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  count: number;
  children: ReactNode;
};

/**
 * Disclosure toggle for archived goals. Renders nothing when count=0.
 * Children are the archived card list — server provides the markup;
 * client only owns open state. Archived cards render at 70% opacity to
 * visually de-emphasize.
 */
export function ArchivedToggle({ count, children }: Props) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div className="border-t border-[--hairline] pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-[--text-2] hover:text-[--text]"
      >
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {open ? 'Hide archived' : `Show archived (${count})`}
      </button>
      {open && <div className="mt-4 space-y-3 opacity-70">{children}</div>}
    </div>
  );
}
