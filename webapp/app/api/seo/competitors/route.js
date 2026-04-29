import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/competitors?siteId=jube|nurube|all
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const where = { isActive: true };
    if (siteId && siteId !== 'all') where.siteId = siteId;

    const competitors = await prisma.seoCompetitor.findMany({
      where,
      orderBy: [{ siteId: 'asc' }, { domain: 'asc' }],
    });

    return NextResponse.json({ success: true, competitors });
  } catch (err) {
    console.error('[API/seo/competitors GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/seo/competitors  { siteId, domain, label }
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.siteId || !body.domain) {
      return NextResponse.json({ success: false, error: 'siteId と domain は必須です' }, { status: 400 });
    }
    const domain = body.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const comp = await prisma.seoCompetitor.upsert({
      where:  { siteId_domain: { siteId: body.siteId, domain } },
      create: { siteId: body.siteId, domain, label: body.label || domain, isActive: true },
      update: { label: body.label || domain, isActive: true },
    });
    return NextResponse.json({ success: true, competitor: comp });
  } catch (err) {
    console.error('[API/seo/competitors POST]', err);
    return NextResponse.json({ success: false, error: '追加に失敗しました' }, { status: 500 });
  }
}

// DELETE  body: { id }
export async function DELETE(request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, error: 'id は必須です' }, { status: 400 });
    await prisma.seoCompetitor.update({
      where: { id: body.id },
      data:  { isActive: false },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API/seo/competitors DELETE]', err);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
