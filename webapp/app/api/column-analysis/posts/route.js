import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// GET /api/column-analysis/posts?siteId=jube&page=1&perPage=50
// worker(Render server.js)経由でWP記事一覧を取得（XSERVERブロック回避）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId  = searchParams.get('siteId')  || 'jube';
    const page    = searchParams.get('page')    || '1';
    const perPage = searchParams.get('perPage') || '50';

    const res  = await workerFetch(
      `/api/wp/posts?siteId=${siteId}&page=${page}&perPage=${perPage}`
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/column-analysis/posts GET]', err);
    return NextResponse.json({ success: false, error: '記事取得に失敗しました' }, { status: 500 });
  }
}
