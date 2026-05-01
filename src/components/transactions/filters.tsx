'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AccountOption } from '@/lib/db/queries/transactions';
import { cn } from '@/lib/utils';

const SELECT_CLASS = cn(
  'flex h-10 rounded-md border border-input bg-background px-3 py-2',
  'text-sm ring-offset-background',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

/**
 * Plaid PFC primary categories come back like 'FOOD_AND_DRINK'. Make readable.
 */
function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function TransactionFilters({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Search has its own controlled state for debouncing.
  const initialSearch = params.get('q') ?? '';
  const [search, setSearch] = useState(initialSearch);

  function pushParams(mutator: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutator(next);
    next.delete('page'); // reset paging when filters change
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

  // Debounced search → URL
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (search === current) return;
    const timer = setTimeout(() => {
      setParam('q', search || undefined);
    }, 350);
    return () => clearTimeout(timer);
    // We intentionally only react to `search` here; reading the latest
    // params in setParam is fine because it pulls from useSearchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasAnyFilter =
    params.has('q') ||
    params.has('account') ||
    params.has('category') ||
    params.has('from') ||
    params.has('to');

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Search by name or merchant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <select
        className={SELECT_CLASS}
        value={params.get('account') ?? ''}
        onChange={(e) => setParam('account', e.target.value || undefined)}
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
        className={SELECT_CLASS}
        value={params.get('category') ?? ''}
        onChange={(e) => setParam('category', e.target.value || undefined)}
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
        className={SELECT_CLASS}
        value={params.get('from') ?? ''}
        onChange={(e) => setParam('from', e.target.value || undefined)}
        aria-label="From date"
      />
      <input
        type="date"
        className={SELECT_CLASS}
        value={params.get('to') ?? ''}
        onChange={(e) => setParam('to', e.target.value || undefined)}
        aria-label="To date"
      />

      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setSearch('');
            startTransition(() => router.push(pathname));
          }}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
