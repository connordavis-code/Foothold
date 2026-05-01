import type { NextAuthConfig } from 'next-auth';
import Resend from 'next-auth/providers/resend';

/**
 * Edge-safe Auth.js config — providers, pages, callbacks, session strategy.
 *
 * NO database adapter here. The DrizzleAdapter pulls in `postgres-js`, which
 * needs Node TCP sockets and breaks on the edge runtime. Middleware imports
 * this file directly to stay edge-compatible; the full auth (with adapter)
 * lives in `./auth.ts` for use in server components and route handlers.
 *
 * See: https://authjs.dev/guides/edge-compatibility
 */
export default {
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
     * Adds user.id to the session object so server components can do
     * `session.user.id`. Note: with database sessions this only runs in
     * Node contexts (server components / route handlers), not in middleware.
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
