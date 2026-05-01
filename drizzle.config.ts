import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

// drizzle-kit runs outside Next.js, so we must load .env.local manually.
config({ path: '.env.local' });

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
