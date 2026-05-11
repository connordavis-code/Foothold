'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CategoryOption } from '@/lib/db/queries/categories';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import type { DayGroup } from '@/lib/transactions/group-by-date';
import { BulkActionBar } from './bulk-action-bar';
import { FilterRow, SEARCH_INPUT_ID } from './filter-row';
import { OperatorPagination } from './operator-pagination';
import { OperatorTable } from './operator-table';

type Props = {
  rows: TransactionListRow[];
  groups: DayGroup[];
  accounts: AccountOption[];
  categories: string[];
  categoryOptions: CategoryOption[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/**
 * Top-level client shell for /transactions. Owns:
 *
 *  - Selected row index for j/k keyboard nav (single-row highlight)
 *  - Selected ids Set for multi-select (bulk re-categorize)
 *  - Last-clicked index anchor for shift-click range select
 *  - Global keyboard handlers: j/k row, ⌘↑/⌘↓ page, "/" focus search
 *
 * Selection state is intentionally NOT persisted to URL — it's
 * ephemeral and shouldn't be shareable. Filters belong in URL,
 * selection doesn't.
 *
 * `groups` is the date-grouped presentational view of `rows` (T1's
 * groupTransactionsByDate) — passed straight through to OperatorTable.
 * Selection math operates on flat `rows`, NOT on groups.
 */
export function OperatorShell({
  rows,
  groups,
  accounts,
  categories,
  categoryOptions,
  page,
  totalPages,
  totalCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState(rows.length > 0 ? 0 : -1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedRef = useRef<number | null>(null);

  // Reset selection when the row set changes (filters / pagination).
  useEffect(() => {
    setSelectedIndex(rows.length > 0 ? 0 : -1);
    setSelectedIds(new Set());
    lastClickedRef.current = null;
  }, [rows]);

  const goToPage = useCallback(
    (target: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (target <= 1) next.delete('page');
      else next.set('page', String(target));
      router.push(next.size ? `${pathname}?${next}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const onToggle = useCallback(
    (id: string, index: number, opts: { range?: boolean }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (opts.range && lastClickedRef.current != null) {
          // Shift-click: extend range from last anchor to current.
          // Direction-agnostic — we always select the inclusive span.
          const lo = Math.min(lastClickedRef.current, index);
          const hi = Math.max(lastClickedRef.current, index);
          for (let i = lo; i <= hi; i++) {
            next.add(rows[i].id);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        lastClickedRef.current = index;
        return next;
      });
    },
    [rows],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedRef.current = null;
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const allChecked =
        rows.length > 0 && rows.every((r) => prev.has(r.id));
      // Indeterminate (some-but-not-all) → select-all is the most-expected
      // interaction. Only the fully-checked state inverts to clear.
      if (allChecked) {
        lastClickedRef.current = null;
        return new Set();
      }
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
        if (page < totalPages) {
          e.preventDefault();
          goToPage(page + 1);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
        if (page > 1) {
          e.preventDefault();
          goToPage(page - 1);
        }
        return;
      }

      if (shouldIgnore(e)) return;

      if (e.key === 'Escape' && selectedIds.size > 0) {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }
      if (e.key === 'j') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(rows.length - 1, i + 1));
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    clearSelection,
    goToPage,
    page,
    rows.length,
    selectedIds.size,
    totalPages,
  ]);

  return (
    <div className="space-y-4">
      <FilterRow accounts={accounts} categories={categories} />
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        onClear={clearSelection}
        categoryOptions={categoryOptions}
        rows={rows}
      />
      <OperatorTable
        rows={rows}
        groups={groups}
        selectedIndex={selectedIndex}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onToggleAllVisible={toggleAllVisible}
      />
      <OperatorPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPage={goToPage}
      />
    </div>
  );
}
