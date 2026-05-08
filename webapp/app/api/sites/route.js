import { NextResponse } from 'next/server';
import { SITE_META } from '@/lib/siteMeta';

// GET /api/sites — サイト一覧（ローカル設定から即時返却、Renderへの問い合わせ不要）
export async function GET() {
  const sites = Object.entries(SITE_META)
    .sort((a, b) => (a[1].order || 99) - (b[1].order || 99))
    .map(([siteId, meta]) => ({
      siteId,
      siteName:  meta.name,
      shortName: meta.shortName,
    }));
  return NextResponse.json({ success: true, sites });
}
