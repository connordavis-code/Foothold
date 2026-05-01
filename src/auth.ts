import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { db } from '@/lib/db';
import {
  authAccounts,
  sessions,
  users,
  verificationTokens,
} from '@/lib/db/schema';

/**
 * Auth.js v5 (NextAuth) configuration.
 *
 * - Magic-link login via Resend (no passwords)
 * - Database session strategy (session row in `session` table)
 * - DrizzleAdapter manages user / account / session / verification_token rows
 *
 * Exports:
 *   - `handlers`  → mounted at /api/auth/[...nextauth]
 *   - `auth()`    → call inside server components / route handlers / middleware
 *                   to read the current session
 *   - `signIn`    → server action: signIn('resend', { email })
 *   - `signOut`   → server action
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/verify',
    error: '/error',
  },
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    /**
     * Runs on every request that calls `auth()`. Adds user.id to the session
     * object so server components can do `session.user.id`.
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
