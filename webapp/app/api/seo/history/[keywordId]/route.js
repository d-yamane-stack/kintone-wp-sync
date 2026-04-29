import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/history/[keywordId]?limit=20&isOwn=true
// 返す: 日時ごとにグループ化した順位データ（グラフ用）
export async function GET(request, { params }) {
  try {
    const { keywordId } = params;
    const { searchParams } = new URL(request.url);
    const limit  = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const ownOnly = searchParams.get('isOwn') !== 'false';

    const where = { keywordId };
    if (ownOnly) where.isOwn = true;

    // 最新 N 件を降順で取得し、グラフ用に昇順へ反転
    const records = await prisma.seoRankRecord.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take:    limit,
    });
    records.reverse();

    // 自サイト履歴をグラフ用に日時ごと集約
    const byDate = {};
    records.forEach(r => {
      const key = r.checkedAt.toISOString();
      if (!byDate[key]) byDate[key] = { checkedAt: r.checkedAt, domains: {} };
      byDate[key].domains[r.domain] = r.position;
    });

    const history = Object.values(byDate).sort(
      (a, b) => new Date(a.checkedAt) - new Date(b.checkedAt)
    );

    return NextResponse.json({ success: true, history, records });
  } catch (err) {
    console.error('[API/seo/history GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}
