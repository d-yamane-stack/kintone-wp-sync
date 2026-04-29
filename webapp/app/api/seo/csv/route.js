import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_CATEGORIES = ['集客', '地域', 'ブランド'];

// GET /api/seo/csv?siteId=jube  — CSVエクスポート
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
          where:   { isOwn: true },
          orderBy: { checkedAt: 'desc' },
          take:    1,
        },
      },
    });

    const rows = [
      ['siteId', 'keyword', 'category', 'isPriority', 'position', 'checkedAt'],
      ...keywords.map(kw => {
        const latest = kw.rankRecords[0] || null;
        return [
          kw.siteId,
          kw.keyword,
          kw.category || '',
          kw.isPriority ? '1' : '0',
          latest && latest.position != null ? String(latest.position) : '',
          latest ? new Date(latest.checkedAt).toISOString() : '',
        ];
      }),
    ];

    const csv = rows.map(r => r.map(cell => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    }).join(',')).join('\n');

    const bom = '﻿'; // Excel UTF-8 BOM
    return new Response(bom + csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seo_keywords_${siteId || 'all'}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    console.error('[API/seo/csv GET]', err);
    return NextResponse.json({ success: false, error: 'エクスポートに失敗しました' }, { status: 500 });
  }
}

// POST /api/seo/csv  body: FormData { file: CSV, siteId }  — CSVインポート
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file     = formData.get('file');
    const siteId   = formData.get('siteId');

    if (!file || !siteId) {
      return NextResponse.json({ success: false, error: 'file と siteId は必須です' }, { status: 400 });
    }

    const text  = await file.text();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // ヘッダー行をスキップ
    const dataLines = lines.slice(1).filter(l => l.trim());

    let imported = 0;
    let skipped  = 0;

    for (const line of dataLines) {
      const cols = parseCsvLine(line);
      if (!cols[1]) { skipped++; continue; }

      const keyword    = cols[1].trim();
      const category   = VALID_CATEGORIES.includes(cols[2]) ? cols[2] : null;
      const isPriority = cols[3] === '1';

      if (!keyword) { skipped++; continue; }

      const existing = await prisma.seoKeyword.findFirst({
        where: { siteId, keyword },
      });
      if (existing) {
        await prisma.seoKeyword.update({
          where: { id: existing.id },
          data:  { isActive: true, category, isPriority },
        });
      } else {
        await prisma.seoKeyword.create({
          data: { siteId, keyword, category, isPriority, isActive: true },
        });
      }
      imported++;
    }

    return NextResponse.json({ success: true, imported, skipped });
  } catch (err) {
    console.error('[API/seo/csv POST]', err);
    return NextResponse.json({ success: false, error: 'インポートに失敗しました' }, { status: 500 });
  }
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { result.push(cur); cur = ''; }
      else { cur += c; }
    }
  }
  result.push(cur);
  return result;
}
