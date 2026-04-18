import { NextResponse } from 'next/server';

// サイト設定は既存 server.js から取得
export async function GET() {
  try {
    const workerApiUrl = process.env.WORKER_API_URL || 'http://localhost:3000';
    const res = await fetch(`${workerApiUrl}/api/sites`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
