// Read-only diagnostic: list recent portfolio_snapshot rows.
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  prepare: false,
  max: 1,
});

const rows = await sql`
  SELECT user_id, snapshot_date, total_value, total_cost_basis, created_at
  FROM portfolio_snapshot
  ORDER BY snapshot_date DESC, created_at DESC
  LIMIT 10
`;
console.table(rows);
await sql.end();
