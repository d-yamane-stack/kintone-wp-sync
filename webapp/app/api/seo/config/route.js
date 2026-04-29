import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_THRESHOLDS = [3, 5, 10];

// GET /api/seo/config?siteId=jube
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) return NextResponse.json({ success: false, error: 'siteId は必須です' }, { status: 400 });

    const config = await prisma.seoSiteConfig.findUnique({ where: { siteId } });
    return NextResponse.json({
      success: true,
      config: config || { siteId, alertThreshold: 5, alertEmail: null },
    });
  } catch (err) {
    console.error('[API/seo/config GET]', err);
    return NextResponse.json({ success: false, error: '設定取得に失敗しました' }, { status: 500 });
  }
}

// PUT /api/seo/config  body: { siteId, alertThreshold, alertEmail }
export async function PUT(request) {
  try {
    const body = await request.json();
    if (!body.siteId) return NextResponse.json({ success: false, error: 'siteId は必須です' }, { status: 400 });

    const threshold = VALID_THRESHOLDS.includes(Number(body.alertThreshold))
      ? Number(body.alertThreshold)
      : 5;
    const email = typeof body.alertEmail === 'string' && body.alertEmail.trim()
      ? body.alertEmail.trim()
      : null;

    const config = await prisma.seoSiteConfig.upsert({
      where:  { siteId: body.siteId },
      update: { alertThreshold: threshold, alertEmail: email },
      create: { siteId: body.siteId, alertThreshold: threshold, alertEmail: email },
    });

    return NextResponse.json({ success: true, config });
  } catch (err) {
    console.error('[API/seo/config PUT]', err);
    return NextResponse.json({ success: false, error: '設定保存に失敗しました' }, { status: 500 });
  }
}
