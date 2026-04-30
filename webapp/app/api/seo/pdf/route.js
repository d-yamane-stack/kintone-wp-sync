import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const SITE_NAMES = { jube: '重兵衛', nurube: 'ぬりべえ' };

// Claude APIを呼んで分析テキストを生成
async function generateAnalysis(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const {
    siteName, total, top10Count, top10Rate,
    risingCount, droppingCount, unrankedCount,
    topRising, topDropping,
    columnCount, caseStudyCount, columnKeywords,
  } = payload;

  const risingText   = topRising.map(k  => `「${k.keyword}」${k.prev}位→${k.cur}位（▲${k.diff}）`).join('、') || 'なし';
  const droppingText = topDropping.map(k => `「${k.keyword}」${k.prev}位→${k.cur}位（▼${k.diff}）`).join('、') || 'なし';
  const colKwText    = columnKeywords.slice(0, 8).join('、') || 'なし';

  const prompt = `あなたはSEOコンサルタントです。以下のデータをもとに、社内会議で使える簡潔・明快なSEOレポートの分析セクションを日本語で作成してください。

【サイト】${siteName}
【追跡キーワード数】${total}件
【Top10内】${top10Count}件（Top10率 ${top10Rate}%）
【上昇】${risingCount}件 【下降】${droppingCount}件 【圏外】${unrankedCount}件

【大きく上昇したキーワード（上位5）】${risingText}
【大きく下降したキーワード（上位5）】${droppingText}

【今月の投稿コンテンツ】コラム ${columnCount}件、施工事例 ${caseStudyCount}件
【投稿コラムキーワード（例）】${colKwText}

以下の4セクションを出力してください。各セクションはHTMLの <h3> と <p> または <ul><li> で構成し、本文のみを出力してください（マークダウン不可）。

<h3>1. 全体動向の分析</h3>
（200字前後。数字を引用しながら今回の傾向を総括）

<h3>2. 特筆すべき変動と考察</h3>
（上昇・下降キーワードを取り上げ、推測される要因を2〜3点）

<h3>3. コンテンツ投稿とSEO順位の相関</h3>
（コラム・施工事例投稿がSEOに与えた影響の考察。200字前後）

<h3>4. 今後の施策提案</h3>
<ul><li>具体的な提案を5点（各1〜2文）</li></ul>`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-7',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text || null;
  } catch (e) {
    console.error('[PDF AI]', e.message);
    return null;
  }
}

// SVGバーチャートを生成
function makeBarChart(items, color) {
  if (!items.length) return '<p style="color:#aaa;font-size:11px;margin:0">データなし</p>';
  const barH = 22, gap = 6, maxVal = Math.max(...items.map(i => i.diff), 1);
  const svgH = items.length * (barH + gap);
  const bars = items.map((item, i) => {
    const w   = Math.round((item.diff / maxVal) * 200);
    const y   = i * (barH + gap);
    const lbl = `${item.keyword}（${item.prev}→${item.cur}位）`;
    return `<g>
      <rect x="0" y="${y}" width="${w}" height="${barH}" rx="3" fill="${color}" opacity="0.8"/>
      <text x="${w + 6}" y="${y + barH / 2 + 4}" font-size="11" fill="#333"
            font-family="'Meiryo','Yu Gothic',sans-serif" dominant-baseline="auto">${lbl}</text>
    </g>`;
  }).join('');
  return `<svg width="100%" viewBox="0 0 480 ${svgH}" style="overflow:visible;display:block">${bars}</svg>`;
}

// GET /api/seo/pdf?siteId=jube — AI生成入り会議資料PDF
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId   = searchParams.get('siteId') || null;
    const siteName = SITE_NAMES[siteId] || siteId || '全サイト';

    // ── キーワード + 順位履歴 ──
    const kwWhere = { isActive: true };
    if (siteId && siteId !== 'all') kwWhere.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where:   kwWhere,
      orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
      select:  { id: true, keyword: true, siteId: true },
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
      const cur  = recs[0]?.position ?? null;
      const prev = recs[1]?.position ?? null;
      const diff = (cur != null && prev != null) ? Math.round(prev) - Math.round(cur) : null;
      return { keyword: kw.keyword, siteId: kw.siteId, cur, prev, diff, checkedAt: recs[0]?.checkedAt };
    });

    // ── KPI計算 ──
    const total         = rows.length;
    const top10Count    = rows.filter(r => r.cur != null && r.cur <= 10).length;
    const top10Rate     = total ? Math.round((top10Count / total) * 100) : 0;
    const risingCount   = rows.filter(r => r.diff != null && r.diff > 0).length;
    const droppingCount = rows.filter(r => r.diff != null && r.diff < 0).length;
    const unrankedCount = rows.filter(r => r.cur == null).length;
    const lastCheck     = rows.reduce((l, r) => {
      if (!r.checkedAt) return l;
      return !l || new Date(r.checkedAt) > new Date(l) ? r.checkedAt : l;
    }, null);

    const topRising  = rows.filter(r => r.diff != null && r.diff > 0)
      .sort((a, b) => b.diff - a.diff).slice(0, 5)
      .map(r => ({ keyword: r.keyword, prev: Math.round(r.prev), cur: Math.round(r.cur), diff: r.diff }));
    const topDropping = rows.filter(r => r.diff != null && r.diff < 0)
      .sort((a, b) => a.diff - b.diff).slice(0, 5)
      .map(r => ({ keyword: r.keyword, prev: Math.round(r.prev), cur: Math.round(r.cur), diff: Math.abs(r.diff) }));

    // ── 当月コンテンツジョブ ──
    const monthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
    const recentJobs = await prisma.contentJob.findMany({
      where:  { deletedAt: null, startedAt: { gte: monthStart }, ...(siteId ? { siteId } : {}) },
      select: { jobType: true, meta: true },
    });
    const columnJobs    = recentJobs.filter(j => j.jobType === 'column');
    const caseStudyJobs = recentJobs.filter(j => j.jobType === 'case_study');
    const columnKeywords = columnJobs.map(j => j.meta?.keyword).filter(Boolean);

    // ── AI分析生成（並行処理不可なので先に待つ） ──
    const aiText = await generateAnalysis({
      siteName, total, top10Count, top10Rate,
      risingCount, droppingCount, unrankedCount,
      topRising, topDropping,
      columnCount:    columnJobs.length,
      caseStudyCount: caseStudyJobs.length,
      columnKeywords,
    });

    // ── HTML構築 ──
    const now = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const lastCheckStr = lastCheck
      ? new Date(lastCheck).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    const risingChart  = makeBarChart(topRising,  '#16a34a');
    const droppingChart = makeBarChart(topDropping, '#dc2626');

    const tableRows = rows.map((r, i) => {
      const pos   = r.cur  != null ? `${Math.round(r.cur)}位`  : '圏外';
      const prev  = r.prev != null ? `${Math.round(r.prev)}位` : '—';
      const diff  = r.diff == null ? '—' : r.diff > 0 ? `▲${r.diff}` : r.diff < 0 ? `▼${Math.abs(r.diff)}` : '±0';
      const dClr  = r.diff == null ? '#999' : r.diff > 0 ? '#15803d' : r.diff < 0 ? '#dc2626' : '#999';
      const isTop3 = r.cur != null && r.cur <= 3;
      const isTop10 = r.cur != null && r.cur <= 10;
      const bg = isTop3 ? '#f5f3ff' : isTop10 ? '#f0fdf4' : (i % 2 === 0 ? '#fff' : '#f9fafb');
      const posColor = isTop3 ? '#7c3aed' : isTop10 ? '#15803d' : '#999';
      return `<tr style="background:${bg}">
        <td>${r.keyword}</td>
        <td style="text-align:center;font-weight:700;color:${posColor}">${pos}</td>
        <td style="text-align:center;color:#888">${prev}</td>
        <td style="text-align:center;color:${dClr};font-weight:700">${diff}</td>
      </tr>`;
    }).join('');

    const kwChips = columnKeywords.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
          ${columnKeywords.map(kw =>
            `<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">${kw}</span>`
          ).join('')}
        </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>SEO順位レポート | ${siteName} | ${now}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Meiryo','Hiragino Kaku Gothic Pro','Yu Gothic',sans-serif;
       font-size:12px;color:#1a1a2e;background:#fff}
  .page{max-width:800px;margin:0 auto;padding:28px 36px}
  .cover{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);
         color:#fff;padding:36px 40px 28px;border-radius:12px;margin-bottom:28px}
  .cover h1{font-size:24px;font-weight:800;letter-spacing:1px;margin-bottom:6px}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
  .kpi-n{font-size:28px;font-weight:800;line-height:1}
  .kpi-l{font-size:10px;color:#64748b;margin-top:5px}
  section{margin-bottom:28px}
  h2{font-size:14px;font-weight:700;color:#1a1a2e;padding:8px 14px;
     background:#f1f5f9;border-left:4px solid #6366f1;border-radius:4px;margin-bottom:14px}
  h3{font-size:13px;font-weight:700;color:#374151;margin:14px 0 6px}
  p{font-size:12px;color:#374151;line-height:1.8;margin-bottom:8px}
  ul{padding-left:18px;margin-bottom:8px}
  li{font-size:12px;color:#374151;line-height:1.8;margin-bottom:4px}
  .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  .chart-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
  .chart-title{font-size:11px;font-weight:700;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead th{background:#1a1a2e;color:#fff;padding:7px 8px;text-align:left}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  .ai-box{background:#fafafa;border:1px solid #e2e8f0;border-radius:10px;padding:18px}
  .footer{border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#94a3b8}
  @media print{.no-print{display:none!important}body{padding:0}.page{padding:12px 20px}.cover{border-radius:0}}
</style>
</head>
<body>
<div class="page">

<button class="no-print" onclick="window.print()"
  style="display:block;margin:0 auto 20px;padding:8px 28px;background:#1a1a2e;color:#fff;
         border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
  🖨️ 印刷 / PDF保存
</button>

<!-- 表紙 -->
<div class="cover">
  <div style="font-size:11px;opacity:0.6;margin-bottom:6px;letter-spacing:2px">SEO REPORT</div>
  <h1>SEO順位レポート</h1>
  <div style="font-size:16px;margin-top:8px;opacity:0.9">${siteName}</div>
  <div style="font-size:11px;opacity:0.7;margin-top:12px">
    作成日時: ${now} ｜ 最終順位取得: ${lastCheckStr} ｜ 追跡キーワード: ${total}件
  </div>
</div>

<!-- 1. KPIサマリー -->
<section>
  <h2>1. 今月のサマリー</h2>
  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-n" style="color:#6366f1">${top10Rate}%</div>
      <div class="kpi-l">Top10率<br>${top10Count}/${total}件</div>
    </div>
    <div class="kpi">
      <div class="kpi-n" style="color:#16a34a">▲${risingCount}</div>
      <div class="kpi-l">順位上昇</div>
    </div>
    <div class="kpi">
      <div class="kpi-n" style="color:#dc2626">▼${droppingCount}</div>
      <div class="kpi-l">順位下降</div>
    </div>
    <div class="kpi">
      <div class="kpi-n" style="color:${unrankedCount > 0 ? '#f59e0b' : '#94a3b8'}">${unrankedCount}</div>
      <div class="kpi-l">圏外</div>
    </div>
  </div>
  <div class="chart-grid">
    <div class="chart-box">
      <div class="chart-title" style="color:#16a34a">▲ 大きく上昇したキーワード</div>
      ${risingChart}
    </div>
    <div class="chart-box">
      <div class="chart-title" style="color:#dc2626">▼ 大きく下降したキーワード</div>
      ${droppingChart}
    </div>
  </div>
</section>

<!-- 2. コンテンツ投稿状況 -->
<section>
  <h2>2. コンテンツ投稿状況（今月）</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:32px;font-weight:800;color:#7c3aed;line-height:1">${columnJobs.length}</div>
      <div style="font-size:11px;color:#6d28d9;margin-top:4px">✍️ コラム投稿</div>
    </div>
    <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:32px;font-weight:800;color:#7c3aed;line-height:1">${caseStudyJobs.length}</div>
      <div style="font-size:11px;color:#6d28d9;margin-top:4px">🏗️ 施工事例取込</div>
    </div>
  </div>
  ${columnKeywords.length > 0 ? `<p style="font-size:11px;color:#6d28d9;margin-bottom:4px">投稿コラムキーワード:</p>${kwChips}` : ''}
</section>

<!-- 3. AI分析・考察 -->
<section>
  <h2>3. 分析・考察・施策提案（AI生成）</h2>
  <div class="ai-box">
    ${aiText || '<p style="color:#aaa">AI分析を生成できませんでした（ANTHROPIC_API_KEY が未設定の可能性があります）。</p>'}
  </div>
</section>

<!-- 4. キーワード詳細一覧 -->
<section>
  <h2>4. キーワード順位詳細</h2>
  <table>
    <thead>
      <tr>
        <th>キーワード</th>
        <th style="text-align:center">現在順位</th>
        <th style="text-align:center">前回</th>
        <th style="text-align:center">変動</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p style="font-size:10px;color:#aaa;margin-top:8px">
    ※ 紫背景: Top3 ／ 緑背景: Top10以内 ／ 圏外: 20位以下または未検出
  </p>
</section>

<div class="footer">
  <p>本レポートはRE-WRITEシステムにより自動生成。分析セクションはClaude AI（claude-opus-4-7）を使用。</p>
</div>
</div>
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
