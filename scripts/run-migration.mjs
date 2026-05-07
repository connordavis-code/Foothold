// One-shot migration runner. Connects via DIRECT_DATABASE_URL (bypasses
// pgbouncer pooler — needed for DDL / multi-statement transactions).
// Usage: node scripts/run-migration.mjs <path-to-sql-file>

import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('usage: node scripts/run-migration.mjs <sql-file>');
  process.exit(1);
}

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error('DIRECT_DATABASE_URL not set in .env.local');
  process.exit(1);
}

const sqlText = readFileSync(sqlPath, 'utf8');
console.log(`Running ${sqlPath} against ${url.replace(/:[^@]+@/, ':***@')}`);

const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql.unsafe(sqlText);
  console.log('Migration applied. Verifying external_item state…');
  const rows = await sql`
    SELECT id, provider, provider_item_id, institution_name, status,
           provider_state, last_synced_at
    FROM external_item
  `;
  console.log(JSON.stringify(rows, null, 2));
} catch (err) {
  console.error('Migration FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
