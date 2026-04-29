import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/history/[keywordId]?limit=20
export async function GET(request, { params }) {
  try {
    const { keywordId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);

    const records = await prisma.seoRankRecord.findMany({
      where:   { keywordId },
      orderBy: { checkedAt: 'asc' },
      take:    limit,
    });

    return NextResponse.json({ success: true, records });
  } catch (err) {
    console.error('[API/seo/history GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}
