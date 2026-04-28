import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// GET — 環境変数の疎通確認（デバッグ用・機密情報はマスク）
export async function GET() {
  const mask = (v) => v ? v.slice(0, 3) + '***' : '(未設定)';
  return NextResponse.json({
    WORKER_API_URL:  process.env.WORKER_API_URL  || '(未設定)',
    API_SECRET_KEY:  process.env.API_SECRET_KEY  ? '✅ set' : '❌ missing',
    jube: {
      wpBaseUrl:     process.env.JUBE_WP_BASE_URL     || process.env.WP_BASE_URL     || '(未設定)',
      wpUsername:    mask(process.env.JUBE_WP_USERNAME  || process.env.WP_USERNAME),
      wpAppPassword: mask(process.env.JUBE_WP_APP_PASSWORD || process.env.WP_APP_PASSWORD),
    },
    nurube: {
      wpBaseUrl:     process.env.NURUBE_WP_BASE_URL    || '(未設定)',
      wpUsername:    mask(process.env.NURUBE_WP_USERNAME),
      wpAppPassword: mask(process.env.NURUBE_WP_APP_PASSWORD),
    },
  });
}

// POST — WP同期ジョブをworkerに送信（Render server.js 経由）
// Vercel(海外IP)から直接WPを叩くとXSERVERにブロックされるため
// ローカルIPで動くworker.jsにBullMQ経由で処理を委譲する
export async function POST() {
  try {
    const res  = await workerFetch('/api/jobs/sync-wp', { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/sync-wp POST]', err);
    return NextResponse.json({ success: false, error: 'WP同期リクエストに失敗しました' }, { status: 500 });
  }
}
