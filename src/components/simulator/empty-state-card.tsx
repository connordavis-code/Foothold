'use client';

import { Plus } from 'lucide-react';
import { FootholdMark } from '@/components/brand/foothold-mark';

type Props = {
  onPickMove: () => void;
};

export function EmptyStateCard({ onPickMove }: Props) {
  return (
    <div className="relative overflow-hidden rounded-card border border-hairline-strong bg-surface-elevated p-10 text-center shadow-sm">
      <div className="relative">
        <div className="mb-3 flex justify-center text-foreground">
          <FootholdMark size={48} />
        </div>
        <h3
          className="font-display italic text-2xl text-foreground"
          style={{ letterSpacing: '-0.02em' }}
        >
          Start with where you stand.
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-2">
          The baseline shows your trajectory if nothing changes for the next 12 months. Add a Move to see how a single decision shifts the line.
        </p>
        <button
          type="button"
          onClick={onPickMove}
          className="mt-5 inline-flex items-center gap-2 rounded-btn bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:-translate-y-0.5 hover:opacity-90"
        >
          <Plus size={14} />
          Pick a Move
        </button>
      </div>
    </div>
  );
}
