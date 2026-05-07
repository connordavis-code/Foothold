import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const rows = await sql`
  SELECT occurred_at, level, op, message, context
  FROM error_log
  ORDER BY occurred_at DESC
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 2));
await sql.end();
