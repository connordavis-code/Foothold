// One-off diagnostic for liquid-balance discrepancy.
// Prints, per depository account: currentBalance, availableBalance,
// updatedAt, type/subtype, and the most recent error_log row scoped
// to its external_item. Read-only.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const accounts = await sql`
  SELECT fa.id, fa.name, fa.mask, fa.type, fa.subtype,
         fa.current_balance, fa.available_balance, fa.iso_currency_code,
         fa.updated_at, fa.created_at,
         ei.id AS item_id, ei.institution_name, ei.provider, ei.status,
         ei.last_synced_at
  FROM financial_account fa
  JOIN external_item ei ON ei.id = fa.item_id
  WHERE fa.type = 'depository'
  ORDER BY ei.institution_name, fa.name
`;

console.log('=== DEPOSITORY ACCOUNTS (liquid balance source) ===');
let total = 0;
let nullCount = 0;
for (const a of accounts) {
  const cb = a.current_balance == null ? null : Number(a.current_balance);
  const ab = a.available_balance == null ? null : Number(a.available_balance);
  if (cb == null) nullCount++; else total += cb;
  console.log(
    `\n${a.institution_name} / ${a.name} ····${a.mask ?? '????'}`,
  );
  console.log(`  type=${a.type}/${a.subtype}  status=${a.status}  provider=${a.provider}`);
  console.log(`  current_balance   = ${cb === null ? 'NULL  <-- treated as $0 by dashboard!' : '$' + cb.toFixed(2)}`);
  console.log(`  available_balance = ${ab === null ? 'NULL' : '$' + ab.toFixed(2)}`);
  console.log(`  updated_at        = ${a.updated_at}`);
  console.log(`  item.last_synced  = ${a.last_synced_at}`);
}
console.log(`\n--- SUM(current_balance) over depository: $${total.toFixed(2)} (excluding ${nullCount} NULL) ---`);

console.log('\n=== RECENT cron.balance_refresh.* ROWS (last 8) ===');
const refresh = await sql`
  SELECT occurred_at, level, op, message, context
  FROM error_log
  WHERE op LIKE 'cron.balance_refresh%'
  ORDER BY occurred_at DESC
  LIMIT 8
`;
for (const r of refresh) {
  const ctx = r.context ? JSON.stringify(r.context) : '';
  console.log(`[${r.occurred_at}] ${r.level} ${r.op}: ${r.message}`);
  if (ctx) console.log(`  context: ${ctx.slice(0, 300)}`);
}

console.log('\n=== RECENT cron.sync.* / sync.dispatcher ROWS (last 8) ===');
const syncRows = await sql`
  SELECT occurred_at, level, op, message
  FROM error_log
  WHERE op LIKE 'cron.sync%' OR op LIKE 'sync.dispatcher%'
  ORDER BY occurred_at DESC
  LIMIT 8
`;
for (const r of syncRows) {
  console.log(`[${r.occurred_at}] ${r.level} ${r.op}: ${r.message}`);
}

await sql.end();
