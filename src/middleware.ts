import { NextResponse, type NextRequest } from 'next/server';
import { isPublicApiPath } from '@/lib/middleware/public-paths';

/**
 * Middleware: route protection only. Edge-safe — does not import Auth.js
 * or any DB code.
 *
 * With database sessions, the session cookie is just an opaque token; the
 * only way to know if it's valid is a DB lookup, which we can't do at the
 * edge. So middleware checks **cookie presence** only — enough to decide
 * "should I redirect to /login?". The actual session validation happens
 * server-side in the (app) layout, where `auth()` hits the database.
 *
 * Redirecting authenticated users away from /login or / is also done
 * server-side (in those page components), so a stale cookie can't cause
 * a redirect loop with the real session check.
 */

const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

// API paths that authenticate themselves and must NOT require a session cookie.
//   - /api/auth: Auth.js endpoints (the cookie doesn't exist yet during login)
//   - /api/plaid/webhook: Plaid signs each call with ES256 JWS; verified in
//     the route. No session — the caller is Plaid, not a browser.
//   - /api/cron: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`;
//     verified by isAuthorizedCronRequest. No session — the caller is Vercel.
const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/plaid/webhook',
  '/api/cron',
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLoggedIn = hasSessionCookie(req);

  const isApi = pathname.startsWith('/api');
  const isPublicApi = isPublicApiPath(pathname, PUBLIC_API_PREFIXES);

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/verify' ||
    pathname === '/error' ||
    isPublicApi;

  const isLandingPage = pathname === '/';
  const isPublicPage = pathname === '/privacy';

  if (!isLoggedIn && !isAuthRoute && !isLandingPage && !isPublicPage) {
    if (isApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)'],
};
