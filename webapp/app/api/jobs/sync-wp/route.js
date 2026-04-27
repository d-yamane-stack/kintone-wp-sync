import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// siteId から WP接続情報を環境変数で解決する
function getSiteCredentials(siteId) {
  if (siteId === 'nurube') {
    return {
      wpBaseUrl:     process.env.NURUBE_WP_BASE_URL,
      wpUsername:    process.env.NURUBE_WP_USERNAME,
      wpAppPassword: process.env.NURUBE_WP_APP_PASSWORD,
      wpPostType:    'properties',
    };
  }
  // jube（デフォルト）
  return {
    wpBaseUrl:     process.env.JUBE_WP_BASE_URL     || process.env.WP_BASE_URL,
    wpUsername:    process.env.JUBE_WP_USERNAME      || process.env.WP_USERNAME,
    wpAppPassword: process.env.JUBE_WP_APP_PASSWORD  || process.env.WP_APP_PASSWORD,
    wpPostType:    'example',
  };
}

// GET /api/jobs/sync-wp — 環境変数の設定状況を診断（認証情報は隠す）
export async function GET() {
  const mask = (v) => v ? v.slice(0, 3) + '***' : '(未設定)';
  return NextResponse.json({
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

// POST /api/jobs/sync-wp
// Vercel(海外IP)から直接WPを叩くとXSERVERにブロックされるため、
// ローカルIPで動くworker.jsにBullMQ経由で処理を委譲する。
export async function POST() {
  try {
    const workerApiUrl = process.env.WORKER_API_URL;
    if (!workerApiUrl) {
      return NextResponse.json(
        { success: false, error: 'WORKER_API_URL が未設定です' },
        { status: 500 }
      );
    }

    const res = await fetch(`${workerApiUrl.replace(/\/$/, '')}/api/jobs/sync-wp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
