import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from '@/auth.config';

/**
 * Middleware uses the edge-safe Auth.js config (no DB adapter). With database
 * sessions, `req.auth` here reflects cookie presence — the actual session row
 * is verified later inside server components via `auth()` from `@/auth`.
 *
 * Behavior:
 *   - Signed-out hits to a protected page → redirect to /login (with callbackUrl)
 *   - Signed-out hits to a protected API → 401 JSON (NOT a redirect — API
 *     clients can't follow HTML redirects sensibly)
 *   - Signed-in hits to /login or / → redirect to /dashboard
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isApi = pathname.startsWith('/api');
  const isAuthApi = pathname.startsWith('/api/auth');

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/verify' ||
    pathname === '/error' ||
    isAuthApi;

  const isLandingPage = pathname === '/';

  if (!isLoggedIn && !isAuthRoute && !isLandingPage) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === '/login' || pathname === '/')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next.js internals + static files. /api/auth is handled by the
  // matcher hitting it first, then bypassed via the isAuthApi check above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)'],
};
