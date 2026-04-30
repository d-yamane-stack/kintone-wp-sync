import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/csv?siteId=jube — 全履歴CSVエクスポート（自サイト順位の全取得データ）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const kwWhere = { isActive: true };
    if (siteId && siteId !== 'all') kwWhere.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where:   kwWhere,
      orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
      select:  { id: true, keyword: true, siteId: true },
    });

    const ids   = keywords.map(k => k.id);
    const kwMap = Object.fromEntries(keywords.map(k => [k.id, k]));

    const records = ids.length > 0
      ? await prisma.seoRankRecord.findMany({
          where:   { keywordId: { in: ids }, isOwn: true },
          orderBy: [{ keywordId: 'asc' }, { checkedAt: 'asc' }],
          select:  { keywordId: true, position: true, checkedAt: true },
        })
      : [];

    const rows = [
      ['siteId', 'keyword', 'checkedAt', 'position'],
      ...records.map(r => {
        const kw = kwMap[r.keywordId];
        return [
          kw?.siteId  || '',
          kw?.keyword || '',
          new Date(r.checkedAt).toISOString(),
          r.position != null ? String(Math.round(r.position)) : '圏外',
        ];
      }),
    ];

    const csv = rows.map(row => row.map(cell => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');

    const bom  = '﻿';
    const date = new Date().toISOString().slice(0, 10);
    return new Response(bom + csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seo_rank_history_${siteId || 'all'}_${date}.csv"`,
      },
    });
  } catch (err) {
    console.error('[API/seo/csv GET]', err);
    return NextResponse.json({ success: false, error: 'エクスポートに失敗しました' }, { status: 500 });
  }
}
