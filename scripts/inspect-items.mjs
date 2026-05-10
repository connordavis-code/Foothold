import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const items = await sql`
  SELECT id, provider, provider_item_id, institution_name, status,
         provider_state, last_synced_at, created_at
  FROM external_item ORDER BY created_at DESC
`;
console.log('--- external_item rows ---');
console.log(JSON.stringify(items, null, 2));

const accs = await sql`
  SELECT fa.id, fa.item_id, ei.institution_name, fa.name, fa.type, fa.subtype
  FROM financial_account fa
  LEFT JOIN external_item ei ON ei.id = fa.item_id
  ORDER BY fa.created_at DESC
  LIMIT 30
`;
console.log('\n--- financial_account rows ---');
console.log(JSON.stringify(accs, null, 2));

await sql.end();
