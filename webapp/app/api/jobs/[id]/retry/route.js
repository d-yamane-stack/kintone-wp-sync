import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { workerFetch } from '@/lib/workerFetch';

// POST /api/jobs/[id]/retry — 失敗ジョブを再実行
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const job = await prisma.contentJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ success: false, error: 'ジョブが見つかりません' }, { status: 404 });
    }

    const endpoint = job.jobType === 'column' ? '/api/jobs/column' : '/api/jobs/case-study';
    const body     = job.jobType === 'column'
      ? { siteId: job.siteId, ...job.meta }
      : { siteId: job.siteId, limit: job.meta?.limit || 3 };

    const res  = await workerFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/jobs/retry POST]', err);
    return NextResponse.json({ success: false, error: '再実行に失敗しました' }, { status: 500 });
  }
}
