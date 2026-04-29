import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/serp/[keywordId] — 最新 SERP Top10 を返す
export async function GET(request, { params }) {
  try {
    const { keywordId } = params;

    const latest = await prisma.seoSerpEntry.findFirst({
      where:   { keywordId },
      orderBy: { checkedAt: 'desc' },
      select:  { checkedAt: true },
    });

    if (!latest) {
      return NextResponse.json({ success: true, entries: [], checkedAt: null });
    }

    const entries = await prisma.seoSerpEntry.findMany({
      where:   { keywordId, checkedAt: latest.checkedAt },
      orderBy: { position: 'asc' },
      select:  { id: true, position: true, url: true, title: true, domain: true, checkedAt: true },
    });

    return NextResponse.json({ success: true, entries, checkedAt: latest.checkedAt });
  } catch (err) {
    console.error('[API/seo/serp GET]', err);
    return NextResponse.json({ success: false, error: '取得失敗' }, { status: 500 });
  }
}
