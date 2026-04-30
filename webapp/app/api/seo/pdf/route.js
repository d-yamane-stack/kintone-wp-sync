import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/seo/pdf?siteId=jube — 印刷用HTML（ブラウザでPDF保存）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || null;

    const where = { isActive: true };
    if (siteId && siteId !== 'all') where.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where,
      orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
    });

    const ids = keywords.map(k => k.id);
    const allRecords = ids.length > 0
      ? await prisma.seoRankRecord.findMany({
          where:   { keywordId: { in: ids }, isOwn: true },
          orderBy: { checkedAt: 'desc' },
          select:  { keywordId: true, position: true, checkedAt: true },
        })
      : [];

    const byKw = {};
    allRecords.forEach(r => {
      if (!byKw[r.keywordId]) byKw[r.keywordId] = [];
      if (byKw[r.keywordId].length < 2) byKw[r.keywordId].push(r);
    });

    const rows = keywords.map(kw => {
      const recs = byKw[kw.id] || [];
      return {
        keyword:      kw.keyword,
        siteId:       kw.siteId,
        position:     recs[0]?.position ?? null,
        prevPosition: recs[1]?.position ?? null,
        checkedAt:    recs[0]?.checkedAt ?? null,
      };
    });

    const now = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const ranked = rows.filter(r => r.position != null).length;
    const rises  = rows.filter(r => r.position != null && r.prevPosition != null && r.position < r.prevPosition).length;
    const drops  = rows.filter(r => r.position != null && r.prevPosition != null && r.position > r.prevPosition).length;

    const tableRows = rows.map((r, i) => {
      const pos      = r.position     != null ? `${Math.round(r.position)}位`     : '圏外';
      const prev     = r.prevPosition != null ? `${Math.round(r.prevPosition)}位` : '—';
      const diff     = (r.position != null && r.prevPosition != null)
        ? Math.round(r.prevPosition) - Math.round(r.position) : null;
      const diffStr  = diff == null ? '—' : diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : '±0';
      const diffClr  = diff == null ? '#999' : diff > 0 ? '#15803d' : diff < 0 ? '#dc2626' : '#999';
      const bg       = i % 2 === 0 ? '#fff' : '#f9fafb';
      return `<tr style="background:${bg}">
        <td>${r.keyword}</td>
        <td style="color:#888">${r.siteId}</td>
        <td style="font-weight:700">${pos}</td>
        <td style="color:#888">${prev}</td>
        <td style="color:${diffClr};font-weight:700">${diffStr}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>SEO順位レポート ${now}</title>
<style>
  body { font-family: 'Meiryo','Hiragino Kaku Gothic Pro',sans-serif; margin:0; padding:20px; color:#1a1a2e; font-size:12px; }
  h1   { font-size:20px; text-align:center; margin-bottom:4px; }
  .sub { text-align:center; color:#888; font-size:11px; margin-bottom:16px; }
  .summary { display:flex; gap:16px; justify-content:center; margin-bottom:18px; }
  .stat    { text-align:center; padding:8px 20px; border:1px solid #e0e0e0; border-radius:6px; }
  .stat-n  { font-size:22px; font-weight:800; }
  .stat-l  { font-size:10px; color:#888; }
  table { border-collapse:collapse; width:100%; font-size:11px; }
  th    { background:#1a1a2e; color:#fff; padding:7px 8px; text-align:left; }
  td    { padding:6px 8px; border-bottom:1px solid #eee; }
  @media print { button { display:none; } body { padding:10px; } }
</style>
</head>
<body>
  <h1>SEO順位レポート</h1>
  <div class="sub">${now} 時点 ／ 全${rows.length}キーワード</div>
  <div class="summary">
    <div class="stat"><div class="stat-n">${ranked}</div><div class="stat-l">順位取得済み</div></div>
    <div class="stat"><div class="stat-n" style="color:#15803d">${rises}</div><div class="stat-l">順位上昇 ▲</div></div>
    <div class="stat"><div class="stat-n" style="color:#dc2626">${drops}</div><div class="stat-l">順位下落 ▼</div></div>
  </div>
  <button onclick="window.print()" style="display:block;margin:0 auto 16px;padding:6px 24px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">
    印刷 / PDF保存
  </button>
  <table>
    <thead>
      <tr><th>キーワード</th><th>サイト</th><th>現在順位</th><th>前回</th><th>変動</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('[API/seo/pdf GET]', err);
    return NextResponse.json({ success: false, error: 'PDF生成に失敗しました' }, { status: 500 });
  }
}
