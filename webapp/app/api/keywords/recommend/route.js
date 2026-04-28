import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// POST /api/keywords/recommend — Render server.js に転送
export async function POST(request) {
  try {
    const body = await request.json();
    const res  = await workerFetch('/api/keywords/recommend', {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/keywords/recommend POST]', err);
    return NextResponse.json({ success: false, error: 'キーワード提案に失敗しました' }, { status: 500 });
  }
}
