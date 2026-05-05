'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { updateTransactionCategoriesAction } from '@/lib/transactions/actions';
import type { CategoryOption } from '@/lib/db/queries/categories';
import type { TransactionListRow } from '@/lib/db/queries/transactions';
import { CategoryPicker } from './category-picker';

type Props = {
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  categoryOptions: CategoryOption[];
  rows: TransactionListRow[];
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
  rows,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedCount === 0) return null;

  async function undoBulk(priorByName: Map<string | null, string[]>) {
    try {
      // Group restore: one round-trip per distinct prior category.
      // Bounded by the number of categories represented in the
      // selection (typically ≤5), not by row count.
      for (const [name, ids] of priorByName) {
        if (ids.length > 0) {
          await updateTransactionCategoriesAction(ids, name);
        }
      }
      toast.success('Undone.');
      router.refresh();
    } catch {
      toast.error('Undo failed. The change is still applied.');
    }
  }

  function applyCategory(name: string | null) {
    // Snapshot prior categories BEFORE the action fires — router.refresh()
    // will replace `rows` with post-update data, and we need the originals
    // for the undo restore. Capturing in closure keeps it race-free.
    const priorById = new Map<string, string | null>();
    for (const row of rows) {
      if (selectedIds.includes(row.id)) {
        priorById.set(row.id, row.overrideCategoryName);
      }
    }

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

        // Group ids by prior category for the undo path.
        const priorByName = new Map<string | null, string[]>();
        for (const [id, prior] of priorById) {
          const bucket = priorByName.get(prior) ?? [];
          bucket.push(id);
          priorByName.set(prior, bucket);
        }

        toast.success(
          name
            ? `Re-categorized ${updated} ${updated === 1 ? 'transaction' : 'transactions'} as “${name}”.`
            : `Cleared category on ${updated} ${updated === 1 ? 'transaction' : 'transactions'}.`,
          {
            action: {
              label: 'Undo',
              onClick: () => {
                void undoBulk(priorByName);
              },
            },
          },
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
