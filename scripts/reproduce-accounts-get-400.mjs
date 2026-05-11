// Reproduces the failing syncAccountsForItem by calling
// plaid.accountsGet locally for each active Plaid item and printing
// the STRUCTURED Plaid error body. Production logger captured
// httpStatus=400 but responseBody=null, suggesting either the body
// genuinely is null OR there's an extraction issue. This script
// goes around the logger and prints raw axios `err.response.data`.
import { config } from 'dotenv';
import postgres from 'postgres';
import { createDecipheriv } from 'node:crypto';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

config({ path: '.env.local' });

const sql = postgres(process.env.DIRECT_DATABASE_URL, {
  prepare: false,
  max: 1,
});

const KEY = Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY, 'base64');
if (KEY.length !== 32) throw new Error(`bad key length ${KEY.length}`);

function decryptToken(encrypted) {
  const blob = Buffer.from(encrypted, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(12, blob.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  }),
);

console.log(`PLAID_ENV=${process.env.PLAID_ENV}`);
console.log(`PLAID_PRODUCTS=${process.env.PLAID_PRODUCTS}`);

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
    console.log(
      `  decrypted token prefix: ${accessToken.slice(0, 20)}... (${accessToken.length} chars)`,
    );
  } catch (e) {
    console.log(`  decrypt failed: ${e.message}`);
    continue;
  }
  try {
    const res = await plaid.accountsGet({ access_token: accessToken });
    console.log(`  OK — ${res.data.accounts.length} accounts`);
  } catch (err) {
    console.log(`  FAILED — status=${err.response?.status}`);
    console.log(
      `  full error body: ${JSON.stringify(err.response?.data, null, 2)}`,
    );
    console.log(`  err.message: ${err.message}`);
  }
}

await sql.end();
