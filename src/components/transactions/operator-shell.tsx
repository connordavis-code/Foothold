'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type AccountOption,
  type TransactionListRow,
} from '@/lib/db/queries/transactions';
import { FilterRow, SEARCH_INPUT_ID } from './filter-row';
import { OperatorTable } from './operator-table';
import { OperatorPagination } from './operator-pagination';

type Props = {
  rows: TransactionListRow[];
  accounts: AccountOption[];
  categories: string[];
  page: number;
  totalPages: number;
  totalCount: number;
};

/**
 * Top-level client shell for /transactions. Owns:
 *
 *  - Selected row index (driven by j/k keyboard nav, scrolled into view)
 *  - Global keyboard handlers: j/k row, ⌘↑/⌘↓ page, "/" focus search
 *
 * Rendered children are independently styled (FilterRow, OperatorTable,
 * OperatorPagination) but share the keyboard surface here so j/k can't
 * fire while the search input has focus.
 */
export function OperatorShell({
  rows,
  accounts,
  categories,
  page,
  totalPages,
  totalCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState(rows.length > 0 ? 0 : -1);
  const tableRef = useRef<HTMLDivElement>(null);

  // Reset selection when the row set changes (filters / pagination).
  useEffect(() => {
    setSelectedIndex(rows.length > 0 ? 0 : -1);
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

  useEffect(() => {
    function shouldIgnore(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      if (!t) return false;
      // Don't trap j/k while typing in any input or contenteditable.
      const tag = t.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        t.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      // ⌘↑ / ⌘↓ for page nav — work even from inputs (the operator
      // pattern: keyboard always available for page-level moves).
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
  }, [goToPage, page, rows.length, totalPages]);

  return (
    <div className="space-y-4" ref={tableRef}>
      <FilterRow accounts={accounts} categories={categories} />
      <OperatorTable rows={rows} selectedIndex={selectedIndex} />
      <OperatorPagination
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPage={goToPage}
      />
    </div>
  );
}
