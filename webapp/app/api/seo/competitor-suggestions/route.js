import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/seo/competitor-suggestions
 *   ?siteId=jube
 *   &ownDomain=jube.co.jp
 *   &keywordIds=id1,id2,...   ← フィルター後のキーワードIDを渡す
 *
 * 指定キーワード群の最新SERPから、自社・登録済み競合以外の
 * TOP10頻出ドメインを最大5件返す。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId        = searchParams.get('siteId');
    const ownDomain     = searchParams.get('ownDomain') || '';
    const keywordIdsRaw = searchParams.get('keywordIds') || '';

    if (!siteId) {
      return NextResponse.json({ success: false, error: 'siteId is required' }, { status: 400 });
    }

    // 登録済み競合ドメインを取得（除外対象）
    const registered = await prisma.seoCompetitor.findMany({
      where:  { siteId, isActive: true },
      select: { domain: true },
    });
    const registeredSet = new Set(registered.map(c => c.domain));

    // フィルター後キーワードIDの取得
    let keywordIds = keywordIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (keywordIds.length === 0) {
      // 指定なし → サイト全キーワード
      const kws = await prisma.seoKeyword.findMany({
        where:  { siteId, isActive: true },
        select: { id: true },
      });
      keywordIds = kws.map(k => k.id);
    }

    if (keywordIds.length === 0) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    // 各キーワードの最新 checkedAt を取得
    const latestDates = await prisma.seoSerpEntry.groupBy({
      by:    ['keywordId'],
      where: { keywordId: { in: keywordIds } },
      _max:  { checkedAt: true },
    });

    // keywordId → latestCheckedAt のマップ
    const latestMap = {};
    latestDates.forEach(r => {
      if (r._max.checkedAt) latestMap[r.keywordId] = r._max.checkedAt.getTime();
    });

    const activeKwIds = Object.keys(latestMap);
    if (activeKwIds.length === 0) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    // 最新チェック分のSERPエントリを取得（TOP10のみ）
    const entries = await prisma.seoSerpEntry.findMany({
      where: {
        keywordId: { in: activeKwIds },
        position:  { lte: 10 },
      },
      select: { keywordId: true, domain: true, position: true, url: true, checkedAt: true },
      orderBy: { checkedAt: 'desc' },
    });

    // 各キーワードの最新チェック分のみ集計
    const domainStats = {};
    entries.forEach(e => {
      // 最新 checkedAt のエントリのみ対象
      if (latestMap[e.keywordId] !== e.checkedAt.getTime()) return;
      // 自社・登録済み除外
      if (e.domain === ownDomain)        return;
      if (registeredSet.has(e.domain))   return;

      if (!domainStats[e.domain]) {
        domainStats[e.domain] = { domain: e.domain, count: 0, bestPosition: 20, sampleUrl: e.url };
      }
      domainStats[e.domain].count++;
      if (e.position < domainStats[e.domain].bestPosition) {
        domainStats[e.domain].bestPosition = e.position;
        domainStats[e.domain].sampleUrl    = e.url;
      }
    });

    // 出現頻度→最高順位でソート、上位5件
    const suggestions = Object.values(domainStats)
      .sort((a, b) => b.count - a.count || a.bestPosition - b.bestPosition)
      .slice(0, 5)
      .map(s => ({
        domain:       s.domain,
        count:        s.count,
        bestPosition: s.bestPosition,
        url:          s.sampleUrl,
      }));

    return NextResponse.json({ success: true, suggestions });
  } catch (err) {
    console.error('[API/seo/competitor-suggestions GET]', err);
    return NextResponse.json({ success: false, error: '取得失敗' }, { status: 500 });
  }
}
