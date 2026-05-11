// Read-only diagnostic: list Plaid external_items with status,
// institution, and the time of last sync attempt. Used to diagnose
// the HTTP 400 from accountsGet on /settings "Sync now".
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  prepare: false,
  max: 1,
});

const rows = await sql`
  SELECT
    ei.id,
    ei.provider,
    ei.institution_name,
    ei.status,
    ei.last_synced_at,
    ei.created_at,
    COUNT(fa.id) AS account_count,
    string_agg(DISTINCT fa.type, ',') AS account_types
  FROM external_item ei
  LEFT JOIN financial_account fa ON fa.item_id = ei.id
  WHERE ei.provider = 'plaid'
  GROUP BY ei.id
  ORDER BY ei.created_at DESC
`;
console.log(JSON.stringify(rows, null, 2));
await sql.end();
