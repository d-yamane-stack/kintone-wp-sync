import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/logs?siteId=jube&limit=20
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;
    const limit  = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const where = {};
    if (siteId && siteId !== 'all') {
      where.siteId = { in: [siteId, 'all'] };
    }

    const logs = await prisma.seoFetchLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take:    limit,
    });

    return NextResponse.json({ success: true, logs });
  } catch (err) {
    console.error('[API/seo/logs GET]', err);
    return NextResponse.json({ success: false, error: 'ログ取得に失敗しました' }, { status: 500 });
  }
}
