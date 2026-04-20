import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/jobs — ジョブ一覧
export async function GET() {
  try {
    const jobs = await prisma.contentJob.findMany({
      where: { deletedAt: null },   // ソフトデリート済みは除外
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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/jobs — ジョブ投入（既存 server.js に転送）
export async function POST(request) {
  try {
    const body = await request.json();
    const workerApiUrl = process.env.WORKER_API_URL || 'http://localhost:3000';
    const endpoint = body.type === 'column'
      ? `${workerApiUrl}/api/jobs/column`
      : `${workerApiUrl}/api/jobs/case-study`;

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
