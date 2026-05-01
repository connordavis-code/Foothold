import { handlers } from '@/auth';

/**
 * Auth.js v5 mounts its handlers here. NextAuth handles:
 *   - GET  /api/auth/signin       (Auth.js's built-in sign-in page, unused — we use /login)
 *   - POST /api/auth/signin/:provider
 *   - GET  /api/auth/callback/:provider  (magic-link verification lands here)
 *   - POST /api/auth/signout
 *   - GET  /api/auth/session
 *   - GET  /api/auth/csrf
 *   - GET  /api/auth/providers
 */
export const { GET, POST } = handlers;
