// Cleanup script: deletes local-dev-only Plaid sync errors from the
// production error_log table. Targets the env-mismatch failures
// triggered by hitting "Sync now" against Plaid items with mismatched
// env config (token env != PLAID_ENV, or key env != PLAID_ENV).
//
// Production Vercel never produces these because its env is consistent.
// Removing them lets the trust strip reflect actual production health
// instead of dev-only mismatch noise.
//
// Two-pass:
//   1. SELECT + print everything that will be deleted (dry run)
//   2. Prompt for confirmation, then DELETE
//
// Safe by construction:
//   - Only level='error' op='sync.dispatcher' provider='plaid' rows
//   - Only HTTP 400 with message='Request failed with status code 400'
//   - Only from the last 24h (today's dev session window)
//   - Production cron failures would have different op/level or recent
//     success rows that should be preserved
import { config } from 'dotenv';
import postgres from 'postgres';
import readline from 'node:readline';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  prepare: false,
  max: 1,
});

const candidates = await sql`
  SELECT id, occurred_at, op, message, context
  FROM error_log
  WHERE level = 'error'
    AND op = 'sync.dispatcher'
    AND context->>'provider' = 'plaid'
    AND (context->>'httpStatus')::int = 400
    AND message = 'Request failed with status code 400'
    AND occurred_at > NOW() - INTERVAL '24 hours'
  ORDER BY occurred_at DESC
`;

console.log(`Found ${candidates.length} dev-only Plaid 400 error rows in last 24h:`);
console.table(
  candidates.map((r) => ({
    id: r.id,
    occurred_at: r.occurred_at,
    httpStatus: r.context?.httpStatus,
    provider: r.context?.provider,
  })),
);

if (candidates.length === 0) {
  console.log('Nothing to clean. Exiting.');
  await sql.end();
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((resolve) =>
  rl.question(`\nDelete these ${candidates.length} rows? Type "yes" to confirm: `, resolve),
);
rl.close();

if (answer.trim().toLowerCase() !== 'yes') {
  console.log('Aborted.');
  await sql.end();
  process.exit(0);
}

const ids = candidates.map((r) => r.id);
const result = await sql`
  DELETE FROM error_log WHERE id = ANY(${ids})
`;
console.log(`Deleted ${result.count} rows.`);
await sql.end();
