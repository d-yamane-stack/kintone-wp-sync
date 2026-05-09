import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// POST /api/column-analysis/analyze
// { siteId, posts: [...], seoKeywords: [...] }
// worker(Render server.js)経由でClaude AIにカテゴリ分析を依頼
export async function POST(request) {
  try {
    const body = await request.json();
    const res  = await workerFetch('/api/column-analysis/analyze', {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/column-analysis/analyze POST]', err);
    return NextResponse.json({ success: false, error: 'AI分析に失敗しました' }, { status: 500 });
  }
}
