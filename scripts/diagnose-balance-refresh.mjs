// One-off diagnostic for the failing balance_refresh cron.
// Pulls cron.balance_refresh.item rows + external_item snapshot
// + per-item account type/subtype counts, so we can see WHICH item
// is throwing and what Plaid is saying in the response body.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const errors = await sql`
  SELECT occurred_at, op, message, context
  FROM error_log
  WHERE op LIKE 'cron.%' OR op LIKE 'plaid.%' OR op LIKE 'sync.%'
  ORDER BY occurred_at DESC
  LIMIT 25
`;

const runs = await sql`
  SELECT occurred_at, op, message
  FROM error_log
  WHERE level = 'info' AND op LIKE 'cron.%'
  ORDER BY occurred_at DESC
  LIMIT 12
`;

const items = await sql`
  SELECT id, provider, institution_name, status, provider_state, created_at, last_synced_at
  FROM external_item
  ORDER BY created_at ASC
`;

const accounts = await sql`
  SELECT item_id, type, subtype, name, provider_account_id
  FROM financial_account
  ORDER BY item_id
`;

const byItem = new Map();
for (const a of accounts) {
  if (!byItem.has(a.item_id)) byItem.set(a.item_id, []);
  byItem.get(a.item_id).push(a);
}

console.log('=== EXTERNAL ITEMS ===');
for (const it of items) {
  const accts = byItem.get(it.id) ?? [];
  console.log(`\n${it.provider}/${it.institution_name} (${it.id})`);
  console.log(`  status=${it.status} created_at=${it.created_at} last_synced_at=${it.last_synced_at}`);
  console.log(`  provider_state=${JSON.stringify(it.provider_state)}`);
  console.log(`  accounts (${accts.length}):`);
  for (const a of accts) {
    console.log(`    - ${a.type}/${a.subtype}  ${a.name}  acct=${a.provider_account_id}`);
  }
}

console.log('\n=== CRON RUN SUMMARIES (last 12 info rows) ===');
for (const r of runs) {
  console.log(`[${r.occurred_at}] ${r.op}: ${r.message}`);
}

console.log('\n=== ERROR ROWS (cron.* / plaid.* / sync.*) ===');
for (const e of errors) {
  console.log(`\n[${e.occurred_at}] op=${e.op}`);
  console.log(`  message: ${e.message?.split('\n')[0]?.slice(0, 200)}`);
}

await sql.end();
