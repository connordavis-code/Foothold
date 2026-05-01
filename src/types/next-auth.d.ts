import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Extend Auth.js's default Session so `session.user.id` is typed.
   * Email/name/image stay in sync with whatever Auth.js carries upstream.
   */
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
