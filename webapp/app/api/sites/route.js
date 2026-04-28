import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// GET /api/sites — サイト一覧（Render server.js から取得）
export async function GET() {
  try {
    const res  = await workerFetch('/api/sites');
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/sites GET]', err);
    return NextResponse.json({ success: false, error: 'サイト一覧の取得に失敗しました' }, { status: 500 });
  }
}
