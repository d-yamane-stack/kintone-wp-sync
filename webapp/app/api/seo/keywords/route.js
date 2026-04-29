import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_CATEGORIES = ['集客', '地域', 'ブランド'];

// GET /api/seo/keywords?siteId=jube|nurube|all
// 競合順位も含めて一括返却（N+1 回避済み）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const where = { isActive: true };
    if (siteId && siteId !== 'all') where.siteId = siteId;

    const [keywords, competitors] = await Promise.all([
      prisma.seoKeyword.findMany({
        where,
        orderBy: [{ siteId: 'asc' }, { isPriority: 'desc' }, { keyword: 'asc' }],
      }),
      prisma.seoCompetitor.findMany({
        where: { isActive: true, ...(siteId && siteId !== 'all' ? { siteId } : {}) },
      }),
    ]);

    const ids = keywords.map(k => k.id);
    const allRecords = ids.length > 0
      ? await prisma.seoRankRecord.findMany({
          where:   { keywordId: { in: ids } },
          orderBy: { checkedAt: 'desc' },
          select:  { keywordId: true, domain: true, isOwn: true, position: true, checkedAt: true },
        })
      : [];

    // グループ化: own → { kwId: [latest, prev] }
    //             comp → { kwId: { domain: latestPosition } }
    const ownMap  = {};
    const compMap = {};
    allRecords.forEach(r => {
      if (r.isOwn) {
        if (!ownMap[r.keywordId]) ownMap[r.keywordId] = [];
        if (ownMap[r.keywordId].length < 2) ownMap[r.keywordId].push(r);
      } else {
        if (!compMap[r.keywordId]) compMap[r.keywordId] = {};
        if (!(r.domain in compMap[r.keywordId])) {
          compMap[r.keywordId][r.domain] = r.position; // 最新のみ保持
        }
      }
    });

    // サイト別競合マップ
    const compBySite = {};
    competitors.forEach(c => {
      if (!compBySite[c.siteId]) compBySite[c.siteId] = [];
      compBySite[c.siteId].push(c);
    });

    const result = keywords.map(kw => {
      const ownRecs          = ownMap[kw.id] || [];
      const kwCompMap        = compMap[kw.id] || {};
      const siteCompetitors  = compBySite[kw.siteId] || [];

      const competitorPositions = {};
      siteCompetitors.forEach(c => {
        competitorPositions[c.domain] = kwCompMap[c.domain] ?? null;
      });

      return {
        id:                  kw.id,
        siteId:              kw.siteId,
        keyword:             kw.keyword,
        category:            kw.category,
        isPriority:          kw.isPriority,
        isActive:            kw.isActive,
        createdAt:           kw.createdAt,
        position:            ownRecs[0]?.position    ?? null,
        prevPosition:        ownRecs[1]?.position    ?? null,
        checkedAt:           ownRecs[0]?.checkedAt   ?? null,
        competitorPositions,
      };
    });

    return NextResponse.json({ success: true, keywords: result, competitors });
  } catch (err) {
    console.error('[API/seo/keywords GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/seo/keywords — キーワード追加（複数行対応）
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.siteId || !body.keyword) {
      return NextResponse.json({ success: false, error: 'siteId と keyword は必須です' }, { status: 400 });
    }

    const category   = VALID_CATEGORIES.includes(body.category) ? body.category : null;
    const isPriority = body.isPriority === true;

    const lines = body.keyword
      .split('\n')
      .map(k => k.replace(/　/g, ' ').trim())
      .filter(k => k.length > 0);

    const results = [];
    for (const kw of lines) {
      const existing = await prisma.seoKeyword.findFirst({
        where: { siteId: body.siteId, keyword: kw },
      });
      let saved;
      if (existing) {
        saved = await prisma.seoKeyword.update({
          where: { id: existing.id },
          data:  { isActive: true, category, isPriority },
        });
      } else {
        saved = await prisma.seoKeyword.create({
          data: { siteId: body.siteId, keyword: kw, category, isPriority, isActive: true },
        });
      }
      results.push(saved);
    }

    return NextResponse.json({ success: true, keywords: results, count: results.length });
  } catch (err) {
    console.error('[API/seo/keywords POST]', err);
    return NextResponse.json({ success: false, error: 'キーワード追加に失敗しました' }, { status: 500 });
  }
}

// PATCH /api/seo/keywords — category/isPriority 更新
export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });

    const data = {};
    if (body.category !== undefined)   data.category   = VALID_CATEGORIES.includes(body.category) ? body.category : null;
    if (body.isPriority !== undefined) data.isPriority = Boolean(body.isPriority);

    const updated = await prisma.seoKeyword.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true, keyword: updated });
  } catch (err) {
    console.error('[API/seo/keywords PATCH]', err);
    return NextResponse.json({ success: false, error: '更新に失敗しました' }, { status: 500 });
  }
}

// DELETE /api/seo/keywords  body: { id }
export async function DELETE(request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    await prisma.seoKeyword.update({
      where: { id: body.id },
      data:  { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API/seo/keywords DELETE]', err);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
