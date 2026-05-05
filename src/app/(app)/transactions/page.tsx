import Link from 'next/link';
import { auth } from '@/auth';
import { OperatorShell } from '@/components/transactions/operator-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

  const [accounts, categories, list] = await Promise.all([
    getUserAccounts(session.user.id),
    getDistinctCategories(session.user.id),
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
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <Card>
          <CardHeader>
            <CardTitle>No accounts connected</CardTitle>
            <CardDescription>
              Connect a bank or brokerage to start syncing transactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
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
        page={list.page}
        totalPages={list.totalPages}
        totalCount={list.totalCount}
      />
    </div>
  );
}
