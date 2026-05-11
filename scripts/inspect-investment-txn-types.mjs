// Read-only diagnostic: distribution of investment_transaction.type by
// provider, used to extend walkback's ALLOWED_TYPES filter after R.3.4
// UAT showed flat (+$0.00) Performance chart — walkback wasn't matching
// any SnapTrade transactions because their `type` values likely differ
// from Plaid's 'transfer' / 'cash' / 'fee'.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  prepare: false,
  max: 1,
});

const distribution = await sql`
  SELECT
    ei.provider,
    it.type,
    it.subtype,
    COUNT(*) AS txn_count,
    MIN(it.date) AS earliest_date,
    MAX(it.date) AS latest_date,
    COALESCE(SUM(it.amount), 0)::numeric(14,2) AS sum_amount
  FROM investment_transaction it
  JOIN financial_account fa ON fa.id = it.account_id
  JOIN external_item ei ON ei.id = fa.item_id
  GROUP BY ei.provider, it.type, it.subtype
  ORDER BY txn_count DESC
`;
console.log('Distribution of investment_transaction.type by provider:');
console.table(distribution);

await sql.end();
