import { NextResponse } from 'next/server';

// GET /api/kintone/records?siteId=jube|nurube
// server.js (port 3000) へ転送
export async function GET(request) {
  try {
    const workerApiUrl = process.env.WORKER_API_URL || 'http://localhost:3000';
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';

    const res = await fetch(`${workerApiUrl}/api/kintone/records?siteId=${siteId}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
