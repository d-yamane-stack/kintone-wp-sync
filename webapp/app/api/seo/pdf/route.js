import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const SITE_NAMES = { jube: '重兵衛', nurube: 'ぬりべえ' };

async function generateAnalysis(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const {
    siteName, total, avgRank, avgRankPrev, avgDiff,
    top10Count, top10Rate, risingCount, droppingCount, unrankedCount,
    alertKeywords, topRising, topDropping,
    columnCount, caseStudyCount, columnKeywords,
  } = payload;

  const risingText   = topRising.map(k  => `「${k.keyword}」${k.prev}位→${k.cur}位（▲${k.diff}）`).join('、') || 'なし';
  const droppingText = topDropping.map(k => `「${k.keyword}」${k.prev}位→${k.cur != null ? k.cur + '位' : '圏外'}（▼${k.diff}）`).join('、') || 'なし';
  const colKwText    = columnKeywords.slice(0, 8).join('、') || 'なし';

  const prompt = `あなたはSEOコンサルタントです。以下のデータをもとに、社内会議で使えるSEO考察を日本語で作成してください。

【サイト】${siteName} / 追跡KW ${total}件
【平均順位】${avgRank}位（前回 ${avgRankPrev}位 / 変動 ${avgDiff != null ? (avgDiff > 0 ? '+' : '') + avgDiff : '—'}）
【TOP10】${top10Count}件（${top10Rate}%）　上昇 ${risingCount}件　下降 ${droppingCount}件　圏外 ${unrankedCount}件
【大きく上昇】${risingText}
【大きく下降・圏外】${droppingText}
【今月コンテンツ】コラム ${columnCount}件、施工事例 ${caseStudyCount}件
【コラムKW例】${colKwText}

以下の2セクションをHTMLで出力してください（マークダウン不可、コードブロック不可）。

<div class="good-col">
<p class="col-title">✅ 好調な点</p>
<ul><li>（箇条書き3〜4点）</li></ul>
</div>
<div class="issue-col">
<p class="col-title">⚠ 課題・懸念点</p>
<ul><li>（箇条書き2〜3点）</li></ul>
</div>`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
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

function getStatus(cur, diff) {
  if (cur == null)                    return { label: '圏外',  color: '#dc2626', bg: '#fef2f2', dot: '△' };
  if (diff != null && diff <= -5)     return { label: '急落',  color: '#dc2626', bg: '#fef2f2', dot: '△' };
  if (diff != null && diff > 5)       return { label: '急上昇', color: '#16a34a', bg: '#f0fdf4', dot: '●' };
  if (diff != null && diff > 0)       return { label: '上昇中', color: '#16a34a', bg: '#f0fdf4', dot: '●' };
  if (cur <= 3)                       return { label: '好調',   color: '#16a34a', bg: '#f0fdf4', dot: '●' };
  if (diff === 0 && cur <= 10)        return { label: '安定',   color: '#6366f1', bg: '#f0f4ff', dot: '●' };
  if (diff != null && diff < 0)       return { label: '下降中', color: '#f59e0b', bg: '#fffbeb', dot: '●' };
  return                              { label: '横ばい', color: '#94a3b8', bg: '#f8fafc', dot: '●' };
}

function makeTrendChart(topKeywords, trendByKw, timePoints) {
  if (!timePoints.length || !topKeywords.length) {
    return '<p style="color:#aaa;text-align:center;padding:20px;font-size:11px">推移データなし（2回以上の取得後に表示されます）</p>';
  }

  const LANE_H = 44;
  const LANE_GAP = 6;
  const LEFT_W = 140;
  const RIGHT_W = 90;
  const CHART_W = 420;
  const DATE_H = 26;
  const MAX_RANK = 30;

  const SVG_W = LEFT_W + CHART_W + RIGHT_W;
  const SVG_H = DATE_H + topKeywords.length * (LANE_H + LANE_GAP);
  const xStep = timePoints.length > 1 ? CHART_W / (timePoints.length - 1) : CHART_W / 2;
  const COLORS = ['#6366f1', '#dc2626', '#16a34a', '#f59e0b', '#0891b2'];

  const gridLines = timePoints.map((_, ti) => {
    const x = (LEFT_W + ti * xStep).toFixed(1);
    return `<line x1="${x}" y1="${DATE_H}" x2="${x}" y2="${SVG_H}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
  }).join('');

  const dateLabels = timePoints.map((tp, ti) => {
    const d = new Date(tp);
    const label = `${d.getMonth() + 1}月${d.getDate()}日`;
    return `<text x="${(LEFT_W + ti * xStep).toFixed(1)}" y="${DATE_H - 6}" text-anchor="middle" font-size="9" fill="#94a3b8">${label}</text>`;
  }).join('');

  const kwLines = topKeywords.map((kw, ki) => {
    const color = COLORS[ki % COLORS.length];
    const yBase = DATE_H + ki * (LANE_H + LANE_GAP);
    const yMid = yBase + LANE_H / 2;
    const laneBg = `<rect x="${LEFT_W}" y="${yBase}" width="${CHART_W}" height="${LANE_H}" fill="${ki % 2 === 0 ? '#f8fafc' : '#ffffff'}" rx="2"/>`;
    const truncLabel = kw.keyword.length > 13 ? kw.keyword.slice(0, 13) + '…' : kw.keyword;
    const kwLabel = `<text x="${LEFT_W - 8}" y="${yMid + 4}" text-anchor="end" font-size="10" fill="#374151">${truncLabel}</text>`;

    const points = timePoints.map((tp, ti) => {
      const rank = trendByKw[kw.id]?.[tp];
      if (rank == null) return null;
      const rankClamped = Math.min(rank, MAX_RANK);
      const yPos = yBase + 4 + ((rankClamped - 1) / (MAX_RANK - 1)) * (LANE_H - 8);
      return { x: LEFT_W + ti * xStep, y: yPos, rank };
    });
    const validPoints = points.filter(Boolean);

    const pathD = validPoints.length >= 2
      ? validPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : '';
    const pathEl = pathD ? `<path d="${pathD}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round"/>` : '';
    const dots = validPoints.map(p =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
    ).join('');

    const curRank = kw.cur;
    const diff = kw.diff;
    const rankStr = curRank != null ? `${Math.round(curRank)}位` : '圏外';
    const rankColor = curRank != null && curRank <= 10 ? '#16a34a' : curRank != null && curRank <= 20 ? '#374151' : '#dc2626';
    const changeStr = diff == null ? '—' : diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : '±0';
    const changeColor = diff == null ? '#94a3b8' : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#94a3b8';

    const rightX = LEFT_W + CHART_W + 10;
    const rankLabel = `<text x="${rightX}" y="${yMid + 4}" font-size="12" font-weight="700" fill="${rankColor}">${rankStr}</text>`;
    const changeLabel = `<text x="${rightX + 42}" y="${yMid + 4}" font-size="10" fill="${changeColor}">${changeStr}</text>`;

    return `${laneBg}${kwLabel}${pathEl}${dots}${rankLabel}${changeLabel}`;
  }).join('');

  return `<svg width="100%" viewBox="0 0 ${SVG_W} ${SVG_H}" style="overflow:visible;display:block;font-family:'Meiryo','Yu Gothic',sans-serif">${gridLines}${dateLabels}${kwLines}</svg>`;
}

function makeCompetitorCards(siteName, ownAvgRank, competitors) {
  const own = { name: siteName, avg: ownAvgRank, isOwn: true, sub: '◀ 自社' };
  const cards = [own, ...competitors.slice(0, 3)];
  return cards.map(s => {
    const border = s.isOwn ? '#6366f1' : '#e2e8f0';
    const bg = s.isOwn ? '#f0f4ff' : '#fafafa';
    const color = s.isOwn ? '#6366f1' : '#1a1a2e';
    const subColor = s.isOwn ? '#6366f1' : '#94a3b8';
    return `<div style="flex:1;min-width:120px;border:1.5px solid ${border};border-radius:8px;padding:12px 14px;background:${bg}">
      <div style="font-size:10px;font-weight:600;color:${subColor};margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</div>
      <div style="font-size:24px;font-weight:800;color:${color};line-height:1.1">${s.avg != null ? s.avg + '位' : '—'}</div>
      <div style="font-size:10px;color:${subColor};margin-top:4px">${s.sub || '競合'}</div>
    </div>`;
  }).join('');
}

function makeActionsTable(rows) {
  const actions = [];

  rows.filter(r => r.diff != null && r.diff <= -5)
    .sort((a, b) => a.diff - b.diff).slice(0, 2)
    .forEach(r => actions.push({ priority: '高', pColor: '#dc2626', pBg: '#fef2f2',
      keyword: r.keyword, action: '競合コンテンツ調査 → タイトル・見出し・内部リンクの見直し', owner: 'コンテンツ担当' }));

  rows.filter(r => r.cur == null && r.prev != null).slice(0, 2)
    .forEach(r => actions.push({ priority: '高', pColor: '#dc2626', pBg: '#fef2f2',
      keyword: r.keyword, action: 'ページ品質チェック（E-E-A-T）・実績・専門性コンテンツ追加', owner: 'ライター' }));

  rows.filter(r => r.cur != null && r.cur >= 11 && r.cur <= 15)
    .sort((a, b) => a.cur - b.cur).slice(0, 2)
    .forEach(r => actions.push({ priority: '中', pColor: '#d97706', pBg: '#fffbeb',
      keyword: r.keyword, action: '関連内部リンク強化 + 地域特化コンテンツ追加でTOP10狙い', owner: 'コンテンツ担当' }));

  rows.filter(r => r.cur != null && r.cur <= 5 && (r.diff == null || r.diff >= 0))
    .sort((a, b) => a.cur - b.cur).slice(0, 2)
    .forEach(r => actions.push({ priority: '低', pColor: '#16a34a', pBg: '#f0fdf4',
      keyword: r.keyword, action: `${Math.round(r.cur)}位維持のため更新頻度キープ。サイテーション獲得も継続`, owner: '全体' }));

  if (!actions.length) return '<p style="font-size:11px;color:#aaa;padding:8px">データが不足しています</p>';

  const rowsHtml = actions.map(a => `<tr>
    <td style="text-align:center;padding:7px 6px;border-bottom:1px solid #f1f5f9">
      <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${a.pBg};color:${a.pColor}">${a.priority}</span>
    </td>
    <td style="padding:7px 6px;font-size:11px;border-bottom:1px solid #f1f5f9">${a.keyword}</td>
    <td style="padding:7px 6px;font-size:11px;border-bottom:1px solid #f1f5f9;line-height:1.6">${a.action}</td>
    <td style="padding:7px 6px;font-size:11px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b">${a.owner}</td>
  </tr>`).join('');

  return `<table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="background:#1a1a2e;color:#fff;padding:7px 6px;text-align:center;font-size:11px;width:52px">優先度</th>
      <th style="background:#1a1a2e;color:#fff;padding:7px 6px;text-align:left;font-size:11px;width:120px">対象KW</th>
      <th style="background:#1a1a2e;color:#fff;padding:7px 6px;text-align:left;font-size:11px">推奨施策</th>
      <th style="background:#1a1a2e;color:#fff;padding:7px 6px;text-align:center;font-size:11px;width:80px">担当</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

// GET /api/seo/pdf?siteId=jube
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId   = searchParams.get('siteId') || null;
    const siteName = SITE_NAMES[siteId] || siteId || '全サイト';

    // ── キーワード ──
    const kwWhere = { isActive: true };
    if (siteId && siteId !== 'all') kwWhere.siteId = siteId;

    const keywords = await prisma.seoKeyword.findMany({
      where:   kwWhere,
      orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
      select:  { id: true, keyword: true, siteId: true },
    });
    const ids = keywords.map(k => k.id);

    // ── 全順位履歴（自サイト）──
    const allRecords = ids.length > 0
      ? await prisma.seoRankRecord.findMany({
          where:   { keywordId: { in: ids }, isOwn: true },
          orderBy: { checkedAt: 'desc' },
          select:  { keywordId: true, position: true, checkedAt: true },
        })
      : [];

    // キーワードごとに全記録をまとめる（降順）
    const byKw = {};
    allRecords.forEach(r => {
      if (!byKw[r.keywordId]) byKw[r.keywordId] = [];
      byKw[r.keywordId].push(r);
    });

    // cur/prev/diff を計算
    const rows = keywords.map(kw => {
      const recs = byKw[kw.id] || [];
      const cur  = recs[0]?.position ?? null;
      const prev = recs[1]?.position ?? null;
      const diff = (cur != null && prev != null) ? Math.round(prev) - Math.round(cur) : null;
      return { id: kw.id, keyword: kw.keyword, siteId: kw.siteId, cur, prev, diff, checkedAt: recs[0]?.checkedAt };
    });

    // ── KPI ──
    const total         = rows.length;
    const validCur      = rows.filter(r => r.cur != null);
    const validPrev     = rows.filter(r => r.prev != null);
    const avgRank       = validCur.length ? Math.round(validCur.reduce((s, r) => s + r.cur, 0) / validCur.length * 10) / 10 : null;
    const avgRankPrev   = validPrev.length ? Math.round(validPrev.reduce((s, r) => s + r.prev, 0) / validPrev.length * 10) / 10 : null;
    const avgDiff       = (avgRank != null && avgRankPrev != null) ? Math.round((avgRankPrev - avgRank) * 10) / 10 : null;
    const top10Count    = rows.filter(r => r.cur != null && r.cur <= 10).length;
    const top10Rate     = total ? Math.round((top10Count / total) * 100) : 0;
    const risingCount   = rows.filter(r => r.diff != null && r.diff > 0).length;
    const droppingCount = rows.filter(r => r.diff != null && r.diff < 0).length;
    const unrankedCount = rows.filter(r => r.cur == null).length;
    const alertKeywords = rows.filter(r => (r.diff != null && r.diff <= -5) || (r.cur == null && r.prev != null));
    const topRising     = rows.filter(r => r.diff != null && r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5)
      .map(r => ({ keyword: r.keyword, prev: Math.round(r.prev), cur: Math.round(r.cur), diff: r.diff }));
    const topDropping   = rows.filter(r => r.diff != null && r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5)
      .map(r => ({ keyword: r.keyword, prev: Math.round(r.prev), cur: r.cur != null ? Math.round(r.cur) : null, diff: Math.abs(r.diff) }));

    // ── 推移グラフ用（上位5KW × 全期間）──
    const top5 = rows.filter(r => r.cur != null).sort((a, b) => a.cur - b.cur).slice(0, 5);
    const top5Ids = top5.map(r => r.id);
    const trendDates = new Set();
    const trendByKw = {};
    top5Ids.forEach(kwId => {
      trendByKw[kwId] = {};
      (byKw[kwId] || []).slice(0, 30).forEach(r => {
        const key = new Date(r.checkedAt).toISOString().slice(0, 10);
        if (!trendByKw[kwId][key]) {
          trendByKw[kwId][key] = Math.round(r.position);
          trendDates.add(key);
        }
      });
    });
    const timePoints = Array.from(trendDates).sort().slice(-6);

    // ── 競合順位 ──
    const compRecords = ids.length > 0
      ? await prisma.seoRankRecord.findMany({
          where:   { keywordId: { in: ids }, isOwn: false },
          orderBy: { checkedAt: 'desc' },
          select:  { domain: true, position: true },
          take:    1000,
        })
      : [];
    const compByDomain = {};
    compRecords.forEach(r => {
      if (!r.domain) return;
      if (!compByDomain[r.domain]) compByDomain[r.domain] = [];
      compByDomain[r.domain].push(r.position);
    });
    const competitors = Object.entries(compByDomain)
      .map(([domain, positions]) => ({
        name: domain,
        avg: Math.round(positions.reduce((s, p) => s + p, 0) / positions.length * 10) / 10,
        isOwn: false,
        sub: '競合',
      }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3);

    // ── 当月コンテンツ ──
    const monthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
    const recentJobs = await prisma.contentJob.findMany({
      where:  { deletedAt: null, startedAt: { gte: monthStart }, ...(siteId ? { siteId } : {}) },
      select: { jobType: true, meta: true },
    });
    const columnJobs    = recentJobs.filter(j => j.jobType === 'column');
    const caseStudyJobs = recentJobs.filter(j => j.jobType === 'case_study');
    const columnKeywords = columnJobs.map(j => j.meta?.keyword).filter(Boolean);

    // ── AI分析生成 ──
    const aiText = await generateAnalysis({
      siteName, total, avgRank, avgRankPrev, avgDiff,
      top10Count, top10Rate, risingCount, droppingCount, unrankedCount,
      alertKeywords: alertKeywords.map(r => ({ keyword: r.keyword, prev: r.prev != null ? Math.round(r.prev) : null, cur: r.cur != null ? Math.round(r.cur) : null, diff: r.diff })),
      topRising, topDropping,
      columnCount: columnJobs.length, caseStudyCount: caseStudyJobs.length, columnKeywords,
    });

    // ── 日付文字列 ──
    const now = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const nowMonth = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
    const lastCheck = rows.reduce((l, r) => {
      if (!r.checkedAt) return l;
      return !l || new Date(r.checkedAt) > new Date(l) ? r.checkedAt : l;
    }, null);
    const lastCheckStr = lastCheck
      ? new Date(lastCheck).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
      : '—';

    // ── SVG等のパーツ ──
    const trendSvg = makeTrendChart(top5, trendByKw, timePoints);
    const compCards = makeCompetitorCards(siteName, avgRank, competitors);
    const actionsTable = makeActionsTable(rows);

    // ── キーワード一覧テーブル（1ページ目）──
    const tableRows = rows.map((r, i) => {
      const pos   = r.cur  != null ? `${Math.round(r.cur)}位`  : '圏外';
      const prev  = r.prev != null ? `${Math.round(r.prev)}位` : '—';
      const diff  = r.diff == null ? '—' : r.diff > 0 ? `▲ +${r.diff}` : r.diff < 0 ? `▼ ${r.diff}` : '— 0';
      const dClr  = r.diff == null ? '#999' : r.diff > 0 ? '#16a34a' : r.diff < 0 ? '#dc2626' : '#999';
      const st    = getStatus(r.cur, r.diff);
      const isTop3  = r.cur != null && r.cur <= 3;
      const isTop10 = r.cur != null && r.cur <= 10;
      const bg = isTop3 ? '#f5f3ff' : isTop10 ? '#f0fdf4' : r.cur == null ? '#fef9f9' : (i % 2 === 0 ? '#fff' : '#f9fafb');
      const posClr = isTop3 ? '#7c3aed' : isTop10 ? '#15803d' : r.cur == null ? '#dc2626' : '#374151';
      return `<tr style="background:${bg}">
        <td style="padding:5px 8px;font-size:11px">${r.keyword}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:${posClr};font-size:12px">${pos}</td>
        <td style="padding:5px 8px;text-align:center;color:#94a3b8;font-size:11px">${prev}</td>
        <td style="padding:5px 8px;text-align:center;color:${dClr};font-weight:700;font-size:11px">${diff}</td>
        <td style="padding:5px 8px;text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;background:${st.bg};color:${st.color}">${st.dot} ${st.label}</span>
        </td>
      </tr>`;
    }).join('');

    // ── KPI表示ヘルパー ──
    const avgDiffStr = avgDiff == null ? '—' : avgDiff > 0 ? `▲ +${avgDiff}` : `▼ ${avgDiff}`;
    const avgDiffClr = avgDiff == null ? '#94a3b8' : avgDiff > 0 ? '#16a34a' : '#dc2626';
    const avgDiffSub = avgDiff == null ? '' : avgDiff > 0 ? '全体的に改善' : '全体的に悪化';

    // ── アラートボックス ──
    const alertBox = alertKeywords.length > 0 ? `
    <div style="background:#fef9f0;border:1.5px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:18px;display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:16px;margin-top:1px">⚠</span>
      <div>
        <p style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">アラート — 急落・圏外キーワードを検出</p>
        ${alertKeywords.slice(0, 3).map(r => {
          const from = r.prev != null ? `${Math.round(r.prev)}位` : '—';
          const to   = r.cur  != null ? `${Math.round(r.cur)}位`  : '圏外';
          const chg  = r.diff != null ? `${Math.abs(r.diff)}位` : '圏外転落';
          return `<p style="font-size:11px;color:#78350f;margin:0">「${r.keyword}」が前回比 <strong>−${chg}</strong>（${from}→${to}）に変動。早急な対策を推奨します。</p>`;
        }).join('')}
      </div>
    </div>` : '';

    // ── アラートカード（KPI右端）──
    const alertCount = alertKeywords.length;

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>SEO順位レポート | ${siteName} | ${now}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Meiryo','Hiragino Kaku Gothic Pro','Yu Gothic',sans-serif;font-size:12px;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:780px;margin:0 auto;padding:24px 32px}
  @media print{
    .no-print{display:none!important}
    body{padding:0}
    .page{padding:12px 18px;max-width:100%}
    .page-break{page-break-after:always;break-after:page}
    @page{size:A4;margin:12mm 14mm}
  }
  .page-break{height:40px}

  /* ヘッダー */
  .report-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #1a1a2e}
  .report-header h1{font-size:20px;font-weight:800;color:#1a1a2e;line-height:1.2}
  .report-header .sub{font-size:12px;color:#64748b;margin-top:3px}
  .report-header .meta{text-align:right;font-size:11px;color:#64748b;line-height:1.8}
  .report-header .meta strong{color:#1a1a2e;font-weight:700}

  /* KPI */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;text-align:center;background:#fafafa}
  .kpi-label{font-size:10px;color:#64748b;margin-bottom:6px;font-weight:500}
  .kpi-value{font-size:26px;font-weight:800;line-height:1.1}
  .kpi-sub{font-size:10px;color:#94a3b8;margin-top:4px}

  /* セクション見出し */
  h2{font-size:13px;font-weight:700;color:#1a1a2e;padding:6px 12px;background:#f1f5f9;border-left:4px solid #6366f1;border-radius:3px;margin-bottom:12px}
  h3{font-size:13px;font-weight:700;color:#1a1a2e;padding:6px 12px;background:#f1f5f9;border-left:4px solid #6366f1;border-radius:3px;margin-bottom:12px}
  section{margin-bottom:22px}

  /* テーブル */
  table thead th{background:#1a1a2e;color:#fff;padding:7px 8px;text-align:left;font-size:11px;font-weight:600}
  table tbody tr:hover{background:#f8fafc}

  /* AI考察グリッド */
  .analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .good-col,.issue-col{border-radius:8px;padding:14px}
  .good-col{background:#f0fdf4;border:1px solid #bbf7d0}
  .issue-col{background:#fef9f0;border:1px solid #fde68a}
  .col-title{font-size:12px;font-weight:700;margin-bottom:8px}
  .good-col .col-title{color:#15803d}
  .issue-col .col-title{color:#92400e}
  .good-col ul,.issue-col ul{padding-left:16px}
  .good-col li,.issue-col li{font-size:11px;line-height:1.8;margin-bottom:3px;color:#374151}

  /* フッター */
  .footer{border-top:1px solid #e2e8f0;padding-top:8px;margin-top:12px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
</style>
</head>
<body>

<button class="no-print" onclick="window.print()"
  style="display:block;margin:16px auto;padding:8px 28px;background:#1a1a2e;color:#fff;
         border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
  🖨️ 印刷 / PDF保存
</button>

<!-- ============================================================ -->
<!-- 1ページ目：エグゼクティブサマリー -->
<!-- ============================================================ -->
<div class="page">

  <div class="report-header">
    <div>
      <h1>SEO順位レポート</h1>
      <div class="sub">${siteName} | ${nowMonth}度</div>
    </div>
    <div class="meta">
      <div>取得日：<strong>${lastCheckStr}</strong></div>
      <div>対象KW：<strong>${total}件</strong></div>
      <div>作成：SEOトラッカー自動生成</div>
    </div>
  </div>

  <!-- KPIカード -->
  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">平均順位</div>
      <div class="kpi-value" style="color:#6366f1">${avgRank != null ? avgRank + '位' : '—'}</div>
      <div class="kpi-sub">前回 ${avgRankPrev != null ? avgRankPrev + '位' : '—'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">前回比 平均変動</div>
      <div class="kpi-value" style="color:${avgDiffClr}">${avgDiffStr}</div>
      <div class="kpi-sub">${avgDiffSub}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">TOP10入り数</div>
      <div class="kpi-value" style="color:#16a34a">${top10Count} <span style="font-size:14px;font-weight:400;color:#94a3b8">/ ${total}</span></div>
      <div class="kpi-sub">TOP10率 ${top10Rate}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">要注意KW</div>
      <div class="kpi-value" style="color:${alertCount > 0 ? '#dc2626' : '#94a3b8'}">${alertCount}件</div>
      <div class="kpi-sub">急落・圏外</div>
    </div>
  </div>

  ${alertBox}

  <!-- キーワード一覧 -->
  <section>
    <h2>キーワード別 順位一覧</h2>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th>キーワード</th>
          <th style="text-align:center;width:70px">今回順位</th>
          <th style="text-align:center;width:70px">前回順位</th>
          <th style="text-align:center;width:70px">変動</th>
          <th style="text-align:center;width:80px">状況</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p style="font-size:10px;color:#94a3b8;margin-top:6px">
      ※ 紫背景: Top3 ／ 緑背景: Top10以内 ／ 赤背景: 圏外
    </p>
  </section>

  <div class="footer">
    <span>SEOトラッカー — 自動生成レポート</span>
    <span>1 / 2</span>
    <span>${siteName} | ${now}</span>
  </div>
</div>

<div class="page-break"></div>

<!-- ============================================================ -->
<!-- 2ページ目：分析・施策レポート -->
<!-- ============================================================ -->
<div class="page">

  <div class="report-header">
    <div>
      <h1>SEO順位レポート — 分析・考察</h1>
      <div class="sub">${siteName} | ${nowMonth}度</div>
    </div>
    <div class="meta">
      <div>取得日：<strong>${lastCheckStr}</strong></div>
    </div>
  </div>

  <!-- 推移グラフ -->
  <section>
    <h3>主要キーワード 順位推移（上位5ワード）</h3>
    <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:14px 10px">
      ${trendSvg}
    </div>
  </section>

  <!-- 競合比較 -->
  ${competitors.length > 0 ? `
  <section>
    <h3>競合サイト 平均順位比較（主要${Math.min(competitors.length, 3)}サイト）</h3>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${compCards}
    </div>
  </section>` : ''}

  <!-- AI考察 -->
  <section>
    <h3>考察</h3>
    <div class="analysis-grid">
      ${aiText || `<div class="good-col"><p class="col-title">✅ 好調な点</p><p style="font-size:11px;color:#aaa">AI分析を生成できませんでした。</p></div><div class="issue-col"><p class="col-title">⚠ 課題・懸念点</p><p style="font-size:11px;color:#aaa">ANTHROPIC_API_KEYをご確認ください。</p></div>`}
    </div>
  </section>

  <!-- 推奨アクション -->
  <section>
    <h3>推奨アクション（次回取得までに）</h3>
    ${actionsTable}
  </section>

  <div class="footer">
    <span>SEOトラッカー — 自動生成レポート</span>
    <span>2 / 2</span>
    <span>${siteName} | ${now}</span>
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
