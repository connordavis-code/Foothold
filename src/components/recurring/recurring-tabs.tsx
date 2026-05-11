'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  /** Server-rendered tree for the Active tab body. RSC element, not a function. */
  active: React.ReactNode;
  /** Server-rendered tree for the Cancelled tab body. RSC element, not a function. */
  cancelled: React.ReactNode;
};

/**
 * Active / Cancelled tab island. Owns ONLY tab visibility state.
 * Both tab bodies are passed as server-rendered React element trees
 * (children-prop pattern) — never functions — to honor the RSC
 * serialization rules from CLAUDE.md > Lessons learned § "Don't
 * pass functions across the server→client boundary in config props".
 */
export function RecurringTabs({ active, cancelled }: Props) {
  const [tab, setTab] = useState<'active' | 'cancelled'>('active');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Filter recurring streams"
        className="inline-flex items-center gap-1 rounded-pill bg-[--surface] p-1"
      >
        <TabPill
          label="Active"
          active={tab === 'active'}
          onClick={() => setTab('active')}
        />
        <TabPill
          label="Cancelled"
          active={tab === 'cancelled'}
          onClick={() => setTab('cancelled')}
        />
      </div>
      <div role="tabpanel">{tab === 'active' ? active : cancelled}</div>
    </div>
  );
}

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-pill px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-[--surface-elevated] text-[--text]'
          : 'text-[--text-2] hover:text-[--text]',
      )}
    >
      {label}
    </button>
  );
}
