import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'rw_session';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // 認証不要パス
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // セッションCookieチェック
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!SESSION_SECRET || !cookie || cookie.value !== SESSION_SECRET) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
