'use client';

import { Search } from 'lucide-react';
import { useCommandPalette } from './palette-context';

/**
 * Search-styled button that opens the ⌘K palette. Lives in the top
 * bar's center slot; on small screens collapses to just the icon. The
 * keyboard hint pill is part of the affordance — without it, the
 * operator-tier shortcut isn't discoverable.
 */
export function PaletteTrigger() {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={open}
      className="group inline-flex h-9 w-full max-w-md items-center gap-2 rounded-card border border-border bg-surface-elevated px-3 text-left text-sm text-muted-foreground transition-colors duration-fast ease-out-quart hover:border-foreground/20 hover:text-foreground"
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4 shrink-0 opacity-60" />
      <span className="hidden flex-1 truncate sm:inline">
        Search transactions, jump to a page…
      </span>
      <span className="ml-auto hidden shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
        ⌘K
      </span>
    </button>
  );
}
