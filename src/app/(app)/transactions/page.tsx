import Link from 'next/link';
import { ArrowRight, Receipt } from 'lucide-react';
import { auth } from '@/auth';
import { MobileTransactionsShell } from '@/components/transactions/mobile-transactions-shell';
import { OperatorShell } from '@/components/transactions/operator-shell';
import { TransactionsPageHeader } from '@/components/transactions/transactions-page-header';
import { TransactionsSummaryStrip } from '@/components/transactions/transactions-summary-strip';
import { Button } from '@/components/ui/button';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import { getSourceHealth } from '@/lib/db/queries/health';
import { getMonthlyTransactionTotals } from '@/lib/db/queries/transaction-totals';
import {
  getDistinctCategories,
  getTransactions,
  getUserAccounts,
} from '@/lib/db/queries/transactions';
import { formatFreshness } from '@/lib/format/freshness';
import { groupTransactionsByDate } from '@/lib/transactions/group-by-date';

type SearchParams = {
  page?: string;
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
};

/**
 * Count of active query-string filters. Drives the "Showing X · N
 * filters applied" sub-line on the KPI strip's Showing cell. `page`
 * is excluded because pagination isn't a filter.
 */
function countActiveFilters(p: SearchParams): number {
  let n = 0;
  if (p.account) n++;
  if (p.category) n++;
  if (p.from) n++;
  if (p.to) n++;
  if (p.q) n++;
  return n;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const page = Math.max(1, Number(searchParams.page) || 1);

  const [accounts, categories, categoryOptions, list, totals, sourceHealth] =
    await Promise.all([
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
      getMonthlyTransactionTotals(session.user.id),
      getSourceHealth(session.user.id),
    ]);

  if (accounts.length === 0) {
    return <EmptyState />;
  }

  const today = new Date();
  const groups = groupTransactionsByDate(list.rows);
  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
    now: today,
  });
  const activeFilters = countActiveFilters(searchParams);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <TransactionsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <TransactionsSummaryStrip
        spend={totals.spend}
        income={totals.income}
        net={totals.net}
        showing={list.rows.length}
        activeFilters={activeFilters}
      />

      <div className="hidden md:block">
        <OperatorShell
          rows={list.rows}
          groups={groups}
          accounts={accounts}
          categories={categories}
          categoryOptions={categoryOptions}
          page={list.page}
          totalPages={list.totalPages}
          totalCount={list.totalCount}
        />
      </div>

      <MobileTransactionsShell
        initialRows={list.rows}
        accounts={accounts}
        categories={categories}
        categoryOptions={categoryOptions}
        initialPage={list.page}
        totalPages={list.totalPages}
        totalCount={list.totalCount}
        filters={{
          accountId: searchParams.account,
          category: searchParams.category,
          dateFrom: searchParams.from,
          dateTo: searchParams.to,
          search: searchParams.q,
        }}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-[--surface] text-[--text-2]">
          <Receipt className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold italic tracking-tight text-[--text]">
            No accounts connected yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
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
