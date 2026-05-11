// Read-only diagnostic: distribution of security.type values across all
// connected holdings, joined with the provider that wrote each row. Used
// to extend classifyHolding's TYPE_LOOKUP after R.3.4 UAT revealed every
// holding falling through to 'Other' on /investments (SnapTrade writes
// short codes like 'cs' / 'et' / 'mf' that don't match the lookup).
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
    s.type,
    COUNT(*) AS holdings_count,
    COALESCE(SUM(h.institution_value), 0)::numeric(14,2) AS total_value
  FROM holding h
  JOIN financial_account fa ON fa.id = h.account_id
  JOIN external_item ei ON ei.id = fa.item_id
  JOIN security s ON s.id = h.security_id
  GROUP BY ei.provider, s.type
  ORDER BY ei.provider, holdings_count DESC
`;
console.log('Distribution of security.type by provider:');
console.table(distribution);

const sample = await sql`
  SELECT
    ei.provider,
    s.type,
    s.ticker,
    s.name
  FROM security s
  JOIN holding h ON h.security_id = s.id
  JOIN financial_account fa ON fa.id = h.account_id
  JOIN external_item ei ON ei.id = fa.item_id
  GROUP BY ei.provider, s.type, s.ticker, s.name
  ORDER BY ei.provider, s.type, s.ticker
`;
console.log('\nDistinct (provider, type, ticker) tuples:');
console.table(sample);

await sql.end();
