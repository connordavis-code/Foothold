// Read-only diagnostic: per-WF-account transaction activity + webhook state.
// Tells us whether Plaid is delivering ANY fresh data (txns) for these
// accounts, and whether recent activity could account for the
// "expected $6k vs displayed $2.6k" gap.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const accounts = await sql`
  SELECT fa.id, fa.name, fa.mask, fa.current_balance, fa.available_balance,
         fa.created_at, ei.id AS item_id, ei.institution_name
  FROM financial_account fa
  JOIN external_item ei ON ei.id = fa.item_id
  WHERE fa.type = 'depository' AND ei.institution_name = 'Wells Fargo'
  ORDER BY fa.name
`;

for (const a of accounts) {
  console.log(`\n=== ${a.name} ····${a.mask} (account opened in Foothold: ${a.created_at}) ===`);
  console.log(`  current=$${Number(a.current_balance).toFixed(2)}  available=$${Number(a.available_balance).toFixed(2)}`);

  const txns = await sql`
    SELECT date, name, merchant_name, amount, primary_category, pending, created_at
    FROM transactions
    WHERE account_id = ${a.id}
    ORDER BY date DESC, created_at DESC
    LIMIT 12
  `;
  console.log(`  Last 12 transactions (Plaid sign: + = OUT, - = IN):`);
  for (const t of txns) {
    const amt = Number(t.amount);
    const sign = amt >= 0 ? '-' : '+';
    const abs = Math.abs(amt).toFixed(2);
    const flag = t.pending ? '[PENDING]' : '         ';
    console.log(`    ${t.date}  ${flag}  ${sign}$${abs.padStart(9)}  ${(t.merchant_name ?? t.name ?? '').slice(0, 40)}`);
  }

  const [thisMonth] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END), 0) AS out_total,
      COALESCE(SUM(CASE WHEN amount::numeric < 0 THEN -amount::numeric ELSE 0 END), 0) AS in_total,
      COUNT(*) AS count
    FROM transactions
    WHERE account_id = ${a.id}
      AND date >= date_trunc('month', CURRENT_DATE)
  `;
  console.log(`  This month: ${thisMonth.count} txns, $${Number(thisMonth.out_total).toFixed(2)} OUT, $${Number(thisMonth.in_total).toFixed(2)} IN`);

  const [latest] = await sql`
    SELECT MAX(date) AS latest_date, MAX(created_at) AS latest_ingest
    FROM transactions WHERE account_id = ${a.id}
  `;
  console.log(`  Most recent posted txn date: ${latest.latest_date}`);
  console.log(`  Most recently ingested at:   ${latest.latest_ingest}`);
}

console.log('\n=== Plaid webhook activity (last 8 webhook log entries) ===');
const hooks = await sql`
  SELECT occurred_at, op, message, context
  FROM error_log
  WHERE op LIKE 'plaid.webhook%'
  ORDER BY occurred_at DESC
  LIMIT 8
`;
if (hooks.length === 0) console.log('  (no webhook log rows — webhook handler may log under different op, or none received)');
for (const h of hooks) {
  console.log(`  [${h.occurred_at}] ${h.op}: ${h.message}`);
  if (h.context) console.log(`    ${JSON.stringify(h.context).slice(0, 200)}`);
}

await sql.end();
