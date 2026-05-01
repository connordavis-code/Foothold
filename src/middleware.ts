import { NextResponse, type NextRequest } from 'next/server';

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

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLoggedIn = hasSessionCookie(req);

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)'],
};
