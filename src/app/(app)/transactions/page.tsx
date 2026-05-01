import Link from 'next/link';
import { auth } from '@/auth';
import { TransactionFilters } from '@/components/transactions/filters';
import { Pagination } from '@/components/transactions/pagination';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type TransactionListRow,
  getDistinctCategories,
  getTransactions,
  getUserAccounts,
} from '@/lib/db/queries/transactions';
import { formatCurrency } from '@/lib/utils';

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
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight mb-6">
          Transactions
        </h1>
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
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All synced transactions across your connected accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <TransactionFilters accounts={accounts} categories={categories} />
        </CardHeader>
        <CardContent className="space-y-4">
          {list.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No transactions match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </TableBody>
            </Table>
          )}
          <Pagination
            page={list.page}
            totalPages={list.totalPages}
            totalCount={list.totalCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ t }: { t: TransactionListRow }) {
  // Plaid: positive = money out. Flip sign for display.
  const display = -t.amount;
  const isIncome = display > 0;

  return (
    <TableRow>
      <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
        {formatTxDate(t.date)}
      </TableCell>
      <TableCell className="max-w-0">
        <p className="font-medium truncate">
          {t.merchantName ?? t.name}
          {t.pending && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              pending
            </span>
          )}
        </p>
        {t.merchantName && t.merchantName !== t.name && (
          <p className="text-xs text-muted-foreground truncate">{t.name}</p>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
        {t.primaryCategory ? humanize(t.primaryCategory) : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
        {t.accountName}
        {t.accountMask && (
          <span className="text-muted-foreground/70"> ····{t.accountMask}</span>
        )}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums font-medium whitespace-nowrap ${
          isIncome ? 'text-positive' : ''
        }`}
      >
        {formatCurrency(display, { signed: true })}
      </TableCell>
    </TableRow>
  );
}

function formatTxDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function humanize(c: string): string {
  return c
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
