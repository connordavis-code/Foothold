// Satisfy env.ts zod validation before any test imports a module that
// transitively loads it. Real values aren't needed — only shape + length
// constraints (e.g. CRON_SECRET >= 32 chars).
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.AUTH_SECRET ??= 'test-auth-secret-must-be-at-least-32-chars-long';
process.env.AUTH_RESEND_KEY ??= 'test-resend-key';
process.env.AUTH_EMAIL_FROM ??= 'test@example.com';
process.env.PLAID_CLIENT_ID ??= 'test-plaid-client';
process.env.PLAID_SECRET ??= 'test-plaid-secret';
process.env.PLAID_TOKEN_ENCRYPTION_KEY ??= 'test-encryption-key-base64-stub';
process.env.CRON_SECRET ??= 'test-cron-secret-must-be-at-least-32-chars';
