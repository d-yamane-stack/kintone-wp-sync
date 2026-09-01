import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { citiesForKeyword, themeForKeyword } from '@/lib/seoAreas';

// 常に最新のDB内容を返す（App Router のGETキャッシュを無効化）
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// 圏外（上位20位以内に未検出）の集計用換算値。
// webapp/app/seo/page.js の OUT_OF_RANGE_POSITION と必ず揃えること。
const OUT_OF_RANGE_POSITION = 21;
function rankValue(position) {
  return position == null ? OUT_OF_RANGE_POSITION : position;
}

/**
 * GET /api/seo/map?siteId=jube&theme=注文住宅
 *
 * 市区町村ごとにSEO順位を集計して返す（地図の塗り分け用）。
 * キーワードは「{テーマ} {エリア}」形式で、エリア表記を lib/seoAreas.js で
 * 市区町村に変換する。地域名（東総など）は構成する複数市に配分する。
 *
 * theme を省略すると全テーマの合算。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const theme  = searchParams.get('theme');
    if (!siteId) {
      return NextResponse.json({ success: false, error: 'siteId が必要です' }, { status: 400 });
    }

    const keywords = await prisma.seoKeyword.findMany({
      where:  { siteId, isActive: true },
      select: { id: true, keyword: true },
    });
    if (keywords.length === 0) {
      return NextResponse.json({ success: true, areas: [], themes: [], keywordCount: 0 });
    }

    // 画面のフィルター選択肢用に、絞り込み前の全テーマを控えておく
    const allThemes = [...new Set(keywords.map(k => themeForKeyword(k.keyword)))].sort();

    const target = theme
      ? keywords.filter(k => themeForKeyword(k.keyword) === theme)
      : keywords;

    // 各キーワードの最新順位（自サイト分のみ）
    const records = await prisma.seoRankRecord.findMany({
      where:   { keywordId: { in: target.map(k => k.id) }, isOwn: true },
      orderBy: { checkedAt: 'desc' },
      select:  { keywordId: true, position: true, checkedAt: true },
    });
    const latest = {};
    records.forEach(r => { if (!latest[r.keywordId]) latest[r.keywordId] = r; });

    // 市区町村ごとに集計
    const byCity = {};
    let unmappedCount = 0;

    target.forEach(kw => {
      const cities = citiesForKeyword(kw.keyword);
      if (cities.length === 0) { unmappedCount++; return; }

      const rec = latest[kw.id];
      cities.forEach(c => {
        const key = c.pref + c.city;
        if (!byCity[key]) {
          byCity[key] = {
            pref: c.pref, city: c.city, fallbackCity: c.fallbackCity || null,
            keywordCount: 0, measuredCount: 0, rankedCount: 0, top10Count: 0,
            positionSum: 0, checkedAt: null,
          };
        }
        const a = byCity[key];
        a.keywordCount++;
        // 未計測のキーワードは平均に含めない（計測済みの中での平均を出す）
        if (!rec) return;
        a.measuredCount++;
        a.positionSum += rankValue(rec.position);
        if (rec.position != null) {
          a.rankedCount++;
          if (rec.position <= 10) a.top10Count++;
        }
        if (!a.checkedAt || rec.checkedAt > a.checkedAt) a.checkedAt = rec.checkedAt;
      });
    });

    const areas = Object.values(byCity).map(a => ({
      pref:          a.pref,
      city:          a.city,
      fallbackCity:  a.fallbackCity,
      keywordCount:  a.keywordCount,
      measuredCount: a.measuredCount,
      rankedCount:   a.rankedCount,
      // 平均順位（圏外は21位換算）。未計測のみのエリアは null
      avgPosition:   a.measuredCount > 0
        ? Math.round((a.positionSum / a.measuredCount) * 10) / 10
        : null,
      // Top10率（計測済みキーワードに対する割合）
      top10Rate:     a.measuredCount > 0
        ? Math.round((a.top10Count / a.measuredCount) * 100)
        : null,
      checkedAt:     a.checkedAt,
    })).sort((x, y) => x.pref.localeCompare(y.pref) || x.city.localeCompare(y.city));

    return NextResponse.json({
      success:      true,
      siteId,
      theme:        theme || null,
      themes:       allThemes,
      keywordCount: target.length,
      // エリア表記を市区町村に変換できなかったキーワード数（変換表の追加が必要なもの）
      unmappedCount,
      areas,
      outOfRangePosition: OUT_OF_RANGE_POSITION,
    });
  } catch (err) {
    console.error('[API/seo/map GET]', err);
    return NextResponse.json({ success: false, error: '集計に失敗しました' }, { status: 500 });
  }
}
