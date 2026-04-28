import { NextResponse } from 'next/server';

const APP_PASSWORD   = process.env.APP_PASSWORD   || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_COOKIE = 'rw_session';

export async function POST(request) {
  try {
    const { password } = await request.json();
    if (!APP_PASSWORD || password !== APP_PASSWORD) {
      return NextResponse.json({ success: false, error: 'パスワードが違います' }, { status: 401 });
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, SESSION_SECRET, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 24 * 30, // 30日
      path:     '/',
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, error: 'ログインに失敗しました' }, { status: 500 });
  }
}
