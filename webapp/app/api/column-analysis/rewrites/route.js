import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 常に最新のDB内容を返す（App Router のGETキャッシュを無効化）
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// GET /api/column-analysis/rewrites?siteId=jube — リライト済みコラム一覧
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || undefined;

    const jobs = await prisma.contentJob.findMany({
      where: { jobType: 'rewrite', deletedAt: null, ...(siteId ? { siteId } : {}) },
      take: 50,
      orderBy: { startedAt: 'desc' },
      include: {
        contentItems: {
          select: { id: true, generatedTitle: true, generatedBody: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const rewrites = jobs.map(j => {
      const it   = j.contentItems[0] || null;
      const meta = j.meta || {};
      return {
        jobId:         j.id,
        itemId:        it ? it.id : null,
        newTitle:      (it && it.generatedTitle) || meta.newTitle || '(無題)',
        originalTitle: meta.originalTitle || '',
        originalUrl:   meta.originalUrl   || '',
        category:      meta.category      || '',
        html:          (it && it.generatedBody) || '',
        createdAt:     (it && it.createdAt) || j.startedAt,
      };
    });

    return NextResponse.json({ success: true, rewrites });
  } catch (err) {
    console.error('[API/column-analysis/rewrites GET]', err);
    return NextResponse.json({ success: false, error: 'リライト一覧の取得に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/column-analysis/rewrites  Body: { jobId } — 一覧から削除（ソフトデリート）
export async function DELETE(request) {
  try {
    const { jobId } = await request.json();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId が必要です' }, { status: 400 });
    }
    await prisma.contentJob.update({
      where: { id: jobId },
      data:  { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API/column-analysis/rewrites DELETE]', err);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
