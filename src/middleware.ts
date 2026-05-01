import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * Middleware: redirect signed-out users to /login (except for auth pages
 * themselves), and redirect signed-in users away from /login → /dashboard.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isAuthRoute =
    pathname === '/login' ||
    pathname === '/verify' ||
    pathname === '/error' ||
    pathname.startsWith('/api/auth');

  // Allow the public landing page only when signed-out.
  const isLandingPage = pathname === '/';

  if (!isLoggedIn && !isAuthRoute && !isLandingPage) {
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
  // Skip Next.js internals + static files + api/auth (handled by NextAuth)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png).*)'],
};
