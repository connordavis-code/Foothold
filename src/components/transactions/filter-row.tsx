'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { AccountOption } from '@/lib/db/queries/transactions';
import { cn } from '@/lib/utils';

export const SEARCH_INPUT_ID = 'tx-search';

const CHIP_BASE = cn(
  'inline-flex h-8 items-center rounded-card border border-border bg-surface-elevated px-3 text-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  'transition-colors duration-fast ease-out-quart',
);

/**
 * Operator-styled inline filter row. Replaces the old Card-headered
 * form. Tighter row, shorter heights, monospaced spacing — meant to
 * read as a command-line strip rather than a form. Search is
 * debounced; account/category/date are committed on change.
 *
 * "/" focuses the search input, courtesy of the page-level shell.
 */
export function FilterRow({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const initialSearch = params.get('q') ?? '';
  const [search, setSearch] = useState(initialSearch);

  function pushParams(mutator: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutator(next);
    next.delete('page');
    startTransition(() => {
      router.push(next.size ? `${pathname}?${next}` : pathname);
    });
  }

  function setParam(key: string, value: string | undefined) {
    pushParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  }

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const timer = setTimeout(() => {
      setParam('q', search || undefined);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasAnyFilter =
    params.has('q') ||
    params.has('account') ||
    params.has('category') ||
    params.has('from') ||
    params.has('to');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <input
          id={SEARCH_INPUT_ID}
          type="text"
          placeholder="Search transactions ( / )"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            CHIP_BASE,
            'h-9 w-full font-mono placeholder:font-sans placeholder:text-muted-foreground',
          )}
        />
      </div>

      <select
        className={cn(CHIP_BASE, 'h-9 cursor-pointer text-muted-foreground')}
        value={params.get('account') ?? ''}
        onChange={(e) => setParam('account', e.target.value || undefined)}
        aria-label="Account"
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.mask ? ` ····${a.mask}` : ''}
          </option>
        ))}
      </select>

      <select
        className={cn(CHIP_BASE, 'h-9 cursor-pointer text-muted-foreground')}
        value={params.get('category') ?? ''}
        onChange={(e) => setParam('category', e.target.value || undefined)}
        aria-label="Category"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {humanize(c)}
          </option>
        ))}
      </select>

      <input
        type="date"
        className={cn(CHIP_BASE, 'h-9 cursor-pointer text-muted-foreground')}
        value={params.get('from') ?? ''}
        onChange={(e) => setParam('from', e.target.value || undefined)}
        aria-label="From date"
      />
      <input
        type="date"
        className={cn(CHIP_BASE, 'h-9 cursor-pointer text-muted-foreground')}
        value={params.get('to') ?? ''}
        onChange={(e) => setParam('to', e.target.value || undefined)}
        aria-label="To date"
      />

      {hasAnyFilter && (
        <button
          type="button"
          onClick={() => {
            setSearch('');
            startTransition(() => router.push(pathname));
          }}
          className={cn(
            CHIP_BASE,
            'h-9 gap-1 px-2 text-muted-foreground hover:text-foreground',
          )}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
