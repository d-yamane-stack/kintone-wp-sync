import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from '@/lib/session';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 認証不要パス（静的ファイル含む）
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cron') ||              // Vercel Cron（セッションCookieを持てないため除外）
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||                 // PWAマニフェスト（OSが無認証で取得するため除外）
    /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|json|webmanifest)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // SESSION_SECRET 未設定時は「誰も通さない」。
  // かつてはソース直書きの固定値へフォールバックしていたため、設定漏れに気付かないまま
  // 誰でもログインを迂回できる状態になっていた。安全側に倒して必ずログイン画面へ送る。
  const secret = getSessionSecret();
  if (!secret) {
    console.error('[auth] SESSION_SECRET が未設定です。全リクエストを拒否します。');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const cookie = request.cookies.get(SESSION_COOKIE);
  const ok = cookie ? await verifySessionToken(cookie.value, secret) : false;
  if (!ok) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
