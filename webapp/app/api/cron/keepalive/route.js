import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 常に実際にDBへ問い合わせる（App Router のGETキャッシュを無効化）
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/cron/keepalive — Supabaseの自動一時停止を防ぐためのDBへの死活クエリ。
 *
 * Supabase無料プランは7日間アクセスが無いとプロジェクトを自動停止する。
 * 本ツールの定期実行（SEO順位チェック）は月2回のため実行間隔が7日を超えており、
 * 人が画面を開かない期間が続くと停止 → workerがDB接続エラーで全ジョブ停止する。
 * vercel.json の crons から1日1回叩くことで「アクセスがある」状態を保つ。
 *
 * 認証: middleware.js の認証除外パス。CRON_SECRET が設定されている場合のみ
 * Vercelが付与する Authorization ヘッダを検証する（未設定でも動作させるのは、
 * 設定漏れで死活クエリが静かに失敗し、停止を防げなくなる事態を避けるため）。
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== 'Bearer ' + secret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // 最軽量のクエリ。行を読まずに接続と応答だけを確認する。
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ success: true, checkedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[Keepalive] DB接続エラー: ' + e.message);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
