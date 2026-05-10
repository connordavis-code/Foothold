// Reproduces the failing cron.balance_refresh by calling
// plaid.accountsBalanceGet locally for each Plaid item and printing the
// STRUCTURED Plaid error body (err.response.data). Production logger only
// captured AxiosError.message, which is opaque ("Request failed with status
// code 400"). The real error_code lives in the response body.
//
// Read-only Plaid call — same one the cron makes every 6h.
import { config } from 'dotenv';
import postgres from 'postgres';
import { createDecipheriv } from 'node:crypto';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

config({ path: '.env.local' });

const sql = postgres(process.env.DIRECT_DATABASE_URL, { prepare: false, max: 1 });

const KEY = Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY, 'base64');
if (KEY.length !== 32) throw new Error(`bad key length ${KEY.length}`);

function decryptToken(encrypted) {
  const blob = Buffer.from(encrypted, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
}));

const items = await sql`
  SELECT id, institution_name, secret
  FROM external_item
  WHERE provider = 'plaid' AND status = 'active'
  ORDER BY created_at ASC
`;

for (const it of items) {
  console.log(`\n=== ${it.institution_name} (${it.id}) ===`);
  let accessToken;
  try {
    accessToken = decryptToken(it.secret);
  } catch (e) {
    console.log(`  decrypt failed: ${e.message}`);
    continue;
  }
  try {
    const res = await plaid.accountsBalanceGet({ access_token: accessToken });
    console.log(`  OK — ${res.data.accounts.length} accounts:`);
    for (const a of res.data.accounts) {
      const c = a.balances.current;
      const v = a.balances.available;
      console.log(`    ${a.subtype}/${a.type}  ${a.name}  current=${c} avail=${v}`);
    }
  } catch (err) {
    console.log(`  FAILED — status=${err.response?.status}`);
    console.log(`  plaid error body: ${JSON.stringify(err.response?.data, null, 2)}`);
  }
}

await sql.end();
