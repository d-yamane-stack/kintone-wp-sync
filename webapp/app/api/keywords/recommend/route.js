import { NextResponse } from 'next/server';

// POST /api/keywords/recommend — ワーカーAPIにプロキシ
export async function POST(request) {
  try {
    const body = await request.json();
    const workerApiUrl = process.env.WORKER_API_URL || 'http://localhost:3000';

    const res = await fetch(`${workerApiUrl}/api/keywords/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
