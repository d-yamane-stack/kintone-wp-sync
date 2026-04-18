import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/jobs/[id]/retry — 失敗ジョブを再実行
export async function POST(request, { params }) {
  try {
    const job = await prisma.contentJob.findUnique({
      where: { id: params.id },
    });
    if (!job) {
      return NextResponse.json({ success: false, error: 'ジョブが見つかりません' }, { status: 404 });
    }

    const workerApiUrl = process.env.WORKER_API_URL || 'http://localhost:3000';
    const endpoint = job.jobType === 'column'
      ? `${workerApiUrl}/api/jobs/column`
      : `${workerApiUrl}/api/jobs/case-study`;

    const body = job.jobType === 'column'
      ? { siteId: job.siteId, ...job.meta }
      : { siteId: job.siteId, limit: job.meta?.limit || 3 };

    const res = await fetch(endpoint, {
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
