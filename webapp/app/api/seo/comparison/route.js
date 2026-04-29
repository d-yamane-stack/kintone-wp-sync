import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/comparison?siteId=jube
// キーワードごとに自サイト＋競合サイトの最新順位を一括返す
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const kwWhere = { isActive: true };
    if (siteId && siteId !== 'all') kwWhere.siteId = siteId;

    const [keywords, competitors] = await Promise.all([
      prisma.seoKeyword.findMany({
        where:   kwWhere,
        orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
      }),
      prisma.seoCompetitor.findMany({
        where:   { isActive: true, ...(siteId && siteId !== 'all' ? { siteId } : {}) },
        orderBy: [{ siteId: 'asc' }, { domain: 'asc' }],
      }),
    ]);

    // 各キーワードの最新チェック日時を特定
    const rows = await Promise.all(keywords.map(async (kw) => {
      // 最新チェック日時を取得
      const latestRecord = await prisma.seoRankRecord.findFirst({
        where:   { keywordId: kw.id },
        orderBy: { checkedAt: 'desc' },
      });
      if (!latestRecord) {
        return { keyword: kw, checkedAt: null, positions: {} };
      }

      // その日時のドメイン別順位を取得
      const records = await prisma.seoRankRecord.findMany({
        where: {
          keywordId: kw.id,
          checkedAt: latestRecord.checkedAt,
        },
      });

      const positions = {};
      records.forEach(r => { positions[r.domain] = r.position; });

      // 前回（最新より前）の自サイト順位
      const prevOwn = await prisma.seoRankRecord.findFirst({
        where: {
          keywordId: kw.id,
          isOwn:     true,
          checkedAt: { lt: latestRecord.checkedAt },
        },
        orderBy: { checkedAt: 'desc' },
      });

      return {
        keyword:         kw,
        checkedAt:       latestRecord.checkedAt,
        positions,
        prevOwnPosition: prevOwn ? prevOwn.position : null,
      };
    }));

    return NextResponse.json({ success: true, rows, competitors });
  } catch (err) {
    console.error('[API/seo/comparison GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}
