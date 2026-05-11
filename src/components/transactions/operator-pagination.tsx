'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  page: number;
  totalPages: number;
  totalCount: number;
  onPage: (page: number) => void;
};

/**
 * Operator-tier pagination. Same contract as the legacy <Pagination>
 * but takes a callback so the keyboard shell can drive page changes
 * (⌘↑ / ⌘↓) through the same code path as the buttons.
 */
export function OperatorPagination({
  page,
  totalPages,
  totalCount,
  onPage,
}: Props) {
  if (totalPages <= 1) {
    return (
      <p className="text-xs text-[--text-2] tabular-nums">
        {totalCount.toLocaleString()}{' '}
        {totalCount === 1 ? 'transaction' : 'transactions'}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[--text-2] tabular-nums">
        Page {page} of {totalPages} · {totalCount.toLocaleString()} total
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="hidden font-mono text-[11px] text-[--text-3] sm:inline">
          ⌘↑ / ⌘↓
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
