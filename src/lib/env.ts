import { z } from 'zod';

/**
 * Validate environment variables at startup. Fails loudly if anything is
 * missing — better than mysterious runtime errors weeks later.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),

  // Auth.js
  AUTH_SECRET: z.string().min(32),
  AUTH_RESEND_KEY: z.string().min(1),
  AUTH_EMAIL_FROM: z.string().email(),

  // Plaid
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
  PLAID_PRODUCTS: z.string().default('transactions,investments'),
  PLAID_COUNTRY_CODES: z.string().default('US'),
  PLAID_CLIENT_NAME: z.string().default('Personal Finance Tool'),
  // 32 bytes, base64-encoded. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Encrypts plaid_item.access_token at rest. Rotating means reconnecting
  // every plaid_item.
  PLAID_TOKEN_ENCRYPTION_KEY: z.string().min(1),

  // Anthropic (optional, used in Phase 3)
  ANTHROPIC_API_KEY: z.string().optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Pretty-print missing vars so the dev fixes them fast.
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  throw new Error('Invalid environment variables. See above.');
}

export const env = parsed.data;

/** Plaid products as an array, parsed from comma-separated env var. */
export const plaidProducts = env.PLAID_PRODUCTS.split(',').map((p) => p.trim());

/** Plaid country codes as an array. */
export const plaidCountryCodes = env.PLAID_COUNTRY_CODES.split(',').map((c) =>
  c.trim(),
);
