import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { workerFetch } from '@/lib/workerFetch';

// GET /api/jobs — ジョブ一覧（Supabase直接）
export async function GET() {
  try {
    const jobs = await prisma.contentJob.findMany({
      where: { deletedAt: null },
      take: 50,
      orderBy: { startedAt: 'desc' },
      include: {
        site: { select: { siteName: true } },
        _count: { select: { contentItems: true } },
        contentItems: {
          select: {
            id: true,
            status: true,
            generatedTitle: true,
            postResult: { select: { wpPostId: true, wpEditUrl: true, postStatus: true, wpPublishedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    console.error('[API/jobs GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/jobs — ジョブ投入（Render server.js に転送）
export async function POST(request) {
  try {
    const body     = await request.json();
    const endpoint = body.type === 'column' ? '/api/jobs/column' : '/api/jobs/case-study';
    const res      = await workerFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const data     = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/jobs POST]', err);
    return NextResponse.json({ success: false, error: 'ジョブ投入に失敗しました' }, { status: 500 });
  }
}
