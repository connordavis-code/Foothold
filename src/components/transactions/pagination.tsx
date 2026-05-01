'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  totalPages,
  totalCount,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function urlFor(p: number) {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete('page');
    else next.set('page', String(p));
    return next.size ? `${pathname}?${next}` : pathname;
  }

  if (totalPages <= 1) {
    return (
      <p className="text-xs text-muted-foreground">
        {totalCount} {totalCount === 1 ? 'transaction' : 'transactions'}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {totalCount} total
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={urlFor(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
        )}
        {page < totalPages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={urlFor(page + 1)}>
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
