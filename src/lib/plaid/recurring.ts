import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type FinancialAccount,
  recurringStreams,
} from '@/lib/db/schema';
import { plaid } from './client';
import type { PlaidExternalItem } from './sync';

const num = (n: number | null | undefined): string | null =>
  n == null ? null : String(n);

/**
 * Refresh recurring streams (subscriptions, payroll, etc.) from
 * /transactions/recurring/get. Plaid emits two arrays — `inflow_streams`
 * (income) and `outflow_streams` (subscriptions/bills) — both upserted
 * here, distinguished by `direction`.
 *
 * Skipped if the item has no depository or credit accounts; recurring
 * detection only operates over those.
 *
 * Plaid recommends scoping the request to specific accounts so that
 * investment accounts don't trip the categorizer. We pass all
 * depository + credit account_ids.
 */
export async function syncRecurringForItem(
  item: PlaidExternalItem,
  accs: FinancialAccount[],
): Promise<{ inflows: number; outflows: number }> {
  const eligible = accs.filter(
    (a) => a.type === 'depository' || a.type === 'credit',
  );
  if (eligible.length === 0) return { inflows: 0, outflows: 0 };

  const acctIdByProviderId = new Map(
    eligible.map((a) => [a.providerAccountId, a.id]),
  );

  let res;
  try {
    res = await plaid.transactionsRecurringGet({
      access_token: item.secret,
      account_ids: eligible.map((a) => a.providerAccountId),
    });
  } catch (e) {
    // PRODUCT_NOT_READY can fire on a freshly-connected item — Plaid
    // needs a few seconds after the initial transactions sync before
    // recurring detection is available. Just skip and let the next
    // sync pick it up.
    const code = (e as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;
    if (code === 'PRODUCT_NOT_READY' || code === 'PRODUCTS_NOT_SUPPORTED') {
      return { inflows: 0, outflows: 0 };
    }
    throw e;
  }

  const buildRow = (s: PlaidStream, direction: 'inflow' | 'outflow') => {
    const accountId = acctIdByProviderId.get(s.account_id);
    if (!accountId) return null;
    return {
      itemId: item.id,
      accountId,
      plaidStreamId: s.stream_id,
      direction,
      description: s.description ?? null,
      merchantName: s.merchant_name ?? null,
      frequency: s.frequency,
      averageAmount: num(s.average_amount?.amount),
      lastAmount: num(s.last_amount?.amount),
      firstDate: s.first_date ?? null,
      lastDate: s.last_date ?? null,
      predictedNextDate: s.predicted_next_date ?? null,
      isActive: s.is_active,
      status: s.status,
      primaryCategory: s.personal_finance_category?.primary ?? null,
      detailedCategory: s.personal_finance_category?.detailed ?? null,
      isoCurrencyCode: s.average_amount?.iso_currency_code ?? 'USD',
    };
  };

  const inflowRows = res.data.inflow_streams
    .map((s) => buildRow(s, 'inflow'))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const outflowRows = res.data.outflow_streams
    .map((s) => buildRow(s, 'outflow'))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const allRows = [...inflowRows, ...outflowRows];
  if (allRows.length === 0) return { inflows: 0, outflows: 0 };

  await db
    .insert(recurringStreams)
    .values(allRows)
    .onConflictDoUpdate({
      target: recurringStreams.plaidStreamId,
      set: {
        description: sql`excluded.description`,
        merchantName: sql`excluded.merchant_name`,
        frequency: sql`excluded.frequency`,
        averageAmount: sql`excluded.average_amount`,
        lastAmount: sql`excluded.last_amount`,
        firstDate: sql`excluded.first_date`,
        lastDate: sql`excluded.last_date`,
        predictedNextDate: sql`excluded.predicted_next_date`,
        isActive: sql`excluded.is_active`,
        status: sql`excluded.status`,
        primaryCategory: sql`excluded.primary_category`,
        detailedCategory: sql`excluded.detailed_category`,
        isoCurrencyCode: sql`excluded.iso_currency_code`,
        updatedAt: new Date(),
      },
    });

  return {
    inflows: inflowRows.length,
    outflows: outflowRows.length,
  };
}

/**
 * Local copy of the relevant slice of Plaid's TransactionStream type.
 * Plaid's SDK types are imported piecemeal; this avoids pulling in the
 * full union for one helper.
 */
type PlaidStream = {
  stream_id: string;
  account_id: string;
  description?: string | null;
  merchant_name?: string | null;
  frequency: string;
  is_active: boolean;
  status: string;
  first_date?: string | null;
  last_date?: string | null;
  predicted_next_date?: string | null;
  average_amount?: {
    amount?: number | null;
    iso_currency_code?: string | null;
  } | null;
  last_amount?: {
    amount?: number | null;
    iso_currency_code?: string | null;
  } | null;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
  } | null;
};
