import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/workerFetch';

// GET /api/kintone/records?siteId=jube|nurube — Render server.js に転送
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';
    const limit  = searchParams.get('limit')  || '10';
    const res    = await workerFetch(`/api/kintone/records?siteId=${encodeURIComponent(siteId)}&limit=${encodeURIComponent(limit)}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/kintone/records GET]', err);
    return NextResponse.json({ success: false, error: 'Kintoneレコード取得に失敗しました' }, { status: 500 });
  }
}
