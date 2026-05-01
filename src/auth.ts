import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import authConfig from '@/auth.config';
import { db } from '@/lib/db';
import {
  authAccounts,
  sessions,
  users,
  verificationTokens,
} from '@/lib/db/schema';

/**
 * Full Auth.js setup with Drizzle adapter. Imports the edge-safe config
 * from `./auth.config` and bolts on the DB adapter. Use this from server
 * components, route handlers, and server actions — NOT from middleware.
 *
 * Exports:
 *   - `handlers`  → mounted at /api/auth/[...nextauth]
 *   - `auth()`    → read the current session (server components / actions)
 *   - `signIn`    → server action: signIn('resend', { email })
 *   - `signOut`   → server action
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
});
