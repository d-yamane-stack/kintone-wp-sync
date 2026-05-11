import { NextResponse } from 'next/server';

const SESSION_COOKIE  = 'rw_session';
const FALLBACK_SECRET = 'rw_sess_f4a8b2c9d1e6f0a3b7c5d2e9f4a1b8c3';
const SESSION_SECRET  = process.env.SESSION_SECRET || FALLBACK_SECRET;

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // 認証不要パス（静的ファイル含む）
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // セッションCookieチェック
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie || cookie.value !== SESSION_SECRET) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
