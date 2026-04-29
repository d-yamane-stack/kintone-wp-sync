import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_CATEGORIES = ['集客', '地域', 'ブランド'];

// GET /api/seo/keywords?siteId=jube|nurube|all
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const where = { isActive: true };
    if (siteId && siteId !== 'all') where.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where,
      orderBy: [{ siteId: 'asc' }, { isPriority: 'desc' }, { keyword: 'asc' }],
      include: {
        rankRecords: {
          where:   { isOwn: true },
          orderBy: { checkedAt: 'desc' },
          take:    2,
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
        category:     kw.category,
        isPriority:   kw.isPriority,
        isActive:     kw.isActive,
        createdAt:    kw.createdAt,
        position:     latest ? latest.position  : null,
        prevPosition: prev   ? prev.position    : null,
        checkedAt:    latest ? latest.checkedAt : null,
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
