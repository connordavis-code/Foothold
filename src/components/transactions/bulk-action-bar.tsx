'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { updateTransactionCategoriesAction } from '@/lib/transactions/actions';
import type { CategoryOption } from '@/lib/db/queries/categories';
import { CategoryPicker } from './category-picker';

type Props = {
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  categoryOptions: CategoryOption[];
};

/**
 * Sticky-position bar that floats below the filter row when one or
 * more rows are selected. Holds the count, the category picker, and
 * a Clear button. Disappears when the selection empties.
 *
 * Uses a transition for the apply flow so the picker stays
 * responsive while the server action runs; toast surfaces the result.
 */
export function BulkActionBar({
  selectedCount,
  selectedIds,
  onClear,
  categoryOptions,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedCount === 0) return null;

  function applyCategory(name: string | null) {
    startTransition(async () => {
      try {
        const { updated } = await updateTransactionCategoriesAction(
          selectedIds,
          name,
        );
        if (updated === 0) {
          toast.error('Nothing was updated. Try again?');
          return;
        }
        toast.success(
          name
            ? `Re-categorized ${updated} ${updated === 1 ? 'transaction' : 'transactions'} as “${name}”.`
            : `Cleared category on ${updated} ${updated === 1 ? 'transaction' : 'transactions'}.`,
        );
        onClear();
        router.refresh();
      } catch {
        toast.error('Re-categorize failed. Try again in a moment.');
      }
    });
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-14 z-20 -mx-4 mb-1 flex items-center gap-3 border-b border-border bg-surface-elevated/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8"
    >
      <span className="font-mono text-xs tabular-nums text-foreground">
        {selectedCount.toLocaleString()} selected
      </span>
      <span className="h-4 w-px bg-border" />
      <CategoryPicker
        options={categoryOptions}
        onApply={applyCategory}
        busy={isPending}
      />
      <button
        type="button"
        onClick={onClear}
        disabled={isPending}
        className="ml-auto inline-flex items-center gap-1 rounded-card px-2 py-1 text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}
