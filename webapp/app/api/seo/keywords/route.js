import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { workerFetch } from '@/lib/workerFetch';

// GET /api/seo/keywords?siteId=jube|nurube|all
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const where = { isActive: true };
    if (siteId && siteId !== 'all') where.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where,
      orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
      include: {
        rankRecords: {
          orderBy: { checkedAt: 'desc' },
          take: 2,
        },
      },
    });

    const result = keywords.map(kw => {
      const latest = kw.rankRecords[0] || null;
      const prev   = kw.rankRecords[1] || null;
      return {
        id:           kw.id,
        siteId:       kw.siteId,
        keyword:      kw.keyword,
        targetUrl:    kw.targetUrl,
        isOwn:        kw.isOwn,
        isActive:     kw.isActive,
        createdAt:    kw.createdAt,
        position:     latest ? latest.position    : null,
        prevPosition: prev   ? prev.position      : null,
        impressions:  latest ? latest.impressions : null,
        clicks:       latest ? latest.clicks      : null,
        ctr:          latest ? latest.ctr         : null,
        checkedAt:    latest ? latest.checkedAt   : null,
        source:       latest ? latest.source      : null,
      };
    });

    return NextResponse.json({ success: true, keywords: result });
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

    // 複数行キーワード対応（全角スペースも区切りとして扱う）
    const lines = body.keyword
      .split('\n')
      .map(k => k.replace(/　/g, ' ').trim())
      .filter(k => k.length > 0);
    const results = [];
    const targetUrl = body.targetUrl || null;
    const isOwn     = body.isOwn !== undefined ? body.isOwn : true;

    for (const kw of lines) {
      // upsert は null フィールドを含む複合ユニークで不安定なため findFirst + create で対応
      const existing = await prisma.seoKeyword.findFirst({
        where: {
          siteId:    body.siteId,
          keyword:   kw,
          targetUrl: targetUrl,
        },
      });

      let saved;
      if (existing) {
        saved = await prisma.seoKeyword.update({
          where: { id: existing.id },
          data:  { isActive: true },
        });
      } else {
        saved = await prisma.seoKeyword.create({
          data: {
            siteId:    body.siteId,
            keyword:   kw,
            targetUrl: targetUrl,
            isOwn:     isOwn,
            isActive:  true,
          },
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
