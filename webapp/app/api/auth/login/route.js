import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  getSessionSecret,
  createSessionToken,
} from '@/lib/session';

export async function POST(request) {
  try {
    // パスワード・署名鍵はいずれも環境変数必須。
    // 既定値を持たせるとリポジトリを読める人が誰でもログインできてしまうため、
    // 未設定のときはログインを成立させず、設定漏れとして扱う。
    const appPassword = process.env.APP_PASSWORD;
    const secret      = getSessionSecret();

    if (!appPassword || !secret) {
      console.error('[auth] APP_PASSWORD / SESSION_SECRET が未設定のためログインできません。');
      return NextResponse.json(
        { success: false, error: 'サーバー側の認証設定が未完了です。管理者にご連絡ください。' },
        { status: 503 }
      );
    }

    const { password } = await request.json();
    if (password !== appPassword) {
      return NextResponse.json({ success: false, error: 'パスワードが違います' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_MAX_AGE, // 30日
      path:     '/',
    });
    return res;
  } catch {
    return NextResponse.json({ success: false, error: 'ログインに失敗しました' }, { status: 500 });
  }
}
