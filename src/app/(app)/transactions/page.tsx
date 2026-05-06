import Link from 'next/link';
import { ArrowRight, Receipt } from 'lucide-react';
import { auth } from '@/auth';
import { OperatorShell } from '@/components/transactions/operator-shell';
import { Button } from '@/components/ui/button';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import {
  getDistinctCategories,
  getTransactions,
  getUserAccounts,
} from '@/lib/db/queries/transactions';

type SearchParams = {
  page?: string;
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const page = Math.max(1, Number(searchParams.page) || 1);

  const [accounts, categories, categoryOptions, list] = await Promise.all([
    getUserAccounts(session.user.id),
    getDistinctCategories(session.user.id),
    getCategoryOptions(session.user.id),
    getTransactions(session.user.id, {
      page,
      accountId: searchParams.account,
      category: searchParams.category,
      dateFrom: searchParams.from,
      dateTo: searchParams.to,
      search: searchParams.q,
    }),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
        <div className="space-y-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
            <Receipt className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              No accounts connected yet
            </h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Once you link a bank or credit card via Plaid, transactions
              sync automatically and surface here within minutes.
            </p>
          </div>
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/settings">
                Connect an account
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-eyebrow">
            Records
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Transactions
          </h1>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {list.totalCount.toLocaleString()}{' '}
          {list.totalCount === 1 ? 'transaction' : 'transactions'}
        </p>
      </div>

      <OperatorShell
        rows={list.rows}
        accounts={accounts}
        categories={categories}
        categoryOptions={categoryOptions}
        page={list.page}
        totalPages={list.totalPages}
        totalCount={list.totalCount}
      />
    </div>
  );
}
