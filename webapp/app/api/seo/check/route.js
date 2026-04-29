import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// POST /api/seo/check — SEO順位チェックジョブを投入
export async function POST(request) {
  try {
    const body = await request.json();
    const res  = await workerFetch('/api/seo/check', {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/seo/check POST]', err);
    return NextResponse.json({ success: false, error: 'チェックジョブ投入に失敗しました' }, { status: 500 });
  }
}
