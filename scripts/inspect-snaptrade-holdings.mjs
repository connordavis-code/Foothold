// Read-only diagnostic: surface SnapTrade-sourced holdings with their
// stored cost_basis vs institution_price. If cost_basis ≈ price, the
// row is in per-share units (pre-fix). If cost_basis >> price, it's in
// total units (post-fix correct).
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const rows = await sql`
  SELECT
    s.ticker,
    h.quantity,
    h.cost_basis,
    h.institution_price,
    h.institution_value,
    fa.name AS account_name,
    -- Heuristic flag: cost_basis ≈ price means per-share storage
    CASE
      WHEN h.cost_basis IS NULL THEN 'null'
      WHEN h.institution_price IS NULL THEN 'unknown'
      WHEN h.cost_basis < h.institution_price * 5 THEN 'PER-SHARE (bug)'
      ELSE 'total (ok)'
    END AS shape
  FROM holding h
  JOIN financial_account fa ON fa.id = h.account_id
  JOIN external_item ei ON ei.id = fa.item_id
  JOIN security s ON s.id = h.security_id
  WHERE ei.provider = 'snaptrade'
  ORDER BY h.cost_basis DESC NULLS LAST
  LIMIT 20
`;
console.table(rows);
await sql.end();
