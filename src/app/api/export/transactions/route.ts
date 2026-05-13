import { eq, desc } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { rowsToCsv, type TransactionExportRow } from '@/lib/export/csv';
import {
  categories,
  externalItems,
  financialAccounts,
  transactions,
} from '@/lib/db/schema';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const rawRows = await db
    .select({
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      category: transactions.primaryCategory,
      categoryOverride: categories.name,
      accountName: financialAccounts.name,
      pending: transactions.pending,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .leftJoin(categories, eq(transactions.categoryOverrideId, categories.id))
    .where(eq(externalItems.userId, session.user.id))
    .orderBy(desc(transactions.date));

  const exportRows: TransactionExportRow[] = rawRows.map((r) => ({
    date: r.date,
    name: r.name,
    merchantName: r.merchantName,
    amount: r.amount,
    category: r.category,
    categoryOverride: r.categoryOverride,
    accountName: r.accountName ?? '',
    pending: r.pending,
  }));

  const csv = rowsToCsv(exportRows);
  const filename = `foothold-transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
