import { NextResponse }          from 'next/server';
import { prisma }                from '@/lib/db';
import { getGoogleAccessToken }  from '@/lib/googleAuth';

export const maxDuration = 60;

const SITE_URLS = {
  jube:   process.env.GSC_SITE_URL_JUBE   || 'https://jube.co.jp/',
  nurube: process.env.GSC_SITE_URL_NURUBE || 'https://nuribe.jp/',
};
const DOMAIN_PATTERNS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};
const SITEMAP_URLS = {
  jube:   'https://jube.co.jp/column-sitemap.xml',
  nurube: 'https://nuribe.jp/column-sitemap.xml',
};

// ── column-sitemap.xml からURL・lastmod一覧取得 ──────────────────────────
async function fetchSitemap(siteId) {
  const url = SITEMAP_URLS[siteId];
  if (!url) return [];
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pwrite/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml    = await res.text();
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    return blocks.map(block => {
      const loc     = (block.match(/<loc>\s*(.*?)\s*<\/loc>/)     || [])[1]?.trim() || '';
      const lastmod = (block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/) || [])[1]?.trim() || '';
      if (!loc) return null;
      return { url: loc, date: lastmod };
    }).filter(Boolean);
  } catch (e) {
    console.warn('[best-columns] sitemap error:', e.message);
    return [];
  }
}

// ── DB からURL→{title, keyword, date}マップ ──────────────────────────────
async function fetchDbMap(siteId) {
  const map = new Map();
  try {
    const items = await prisma.contentItem.findMany({
      where: {
        job: { siteId, jobType: 'column', deletedAt: null },
        generatedTitle: { not: null },
      },
      select: {
        generatedTitle: true,
        createdAt:      true,
        job:            { select: { meta: true } },
        postResult:     { select: { wpUrl: true, wpPublishedAt: true } },
      },
    });
    for (const item of items) {
      const url = item.postResult?.wpUrl;
      if (!url) continue;
      const entry = {
        title:   item.generatedTitle || '',
        keyword: item.job?.meta?.keyword || '',
        date:    (item.postResult?.wpPublishedAt || item.createdAt)?.toISOString?.() || '',
      };
      for (const v of urlVariants(url)) {
        if (!map.has(v)) map.set(v, entry);
      }
    }
  } catch (e) {
    console.warn('[best-columns] DB error:', e.message);
  }
  return map;
}

// ── GSC データ取得（90日） ────────────────────────────────────────────────
async function fetchGSC(siteId) {
  const siteUrl = SITE_URLS[siteId];
  if (!siteUrl) return [];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 89);
  const fmt = d => d.toISOString().slice(0, 10);

  try {
    const token = await getGoogleAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['page'], rowLimit: 2000 }),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.rows || []).map(r => ({
      url:         r.keys[0],
      clicks:      r.clicks      || 0,
      impressions: r.impressions || 0,
      ctr:         r.ctr         || 0,
      position:    r.position    || 0,
    }));
  } catch {
    return [];
  }
}

// ── URLの正規化バリアント（trailing-slash × encoded/decoded） ────────────
function urlVariants(url) {
  const set = new Set();
  const add = u => {
    if (!u) return;
    set.add(u);
    set.add(u.endsWith('/') ? u.slice(0, -1) : u + '/');
  };
  add(url);
  try {
    const u = new URL(url);
    add(u.origin + decodeURIComponent(u.pathname));
    add(u.origin + u.pathname.split('/').map(s => {
      try { return s ? encodeURIComponent(decodeURIComponent(s)) : ''; } catch { return s; }
    }).join('/'));
  } catch {}
  return set;
}

// ── URLのスラグを日本語デコードして返す ──────────────────────────────────
function slugFromUrl(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    const raw  = segs[segs.length - 1] || '';
    try { return decodeURIComponent(raw); } catch { return raw; }
  } catch { return url; }
}

// ── Claude AI分析 ─────────────────────────────────────────────────────────
async function analyzeWithClaude(top10, siteId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const listText = top10.map((p, i) => {
    const pct = (Math.round((p.ctr || 0) * 1000) / 10).toFixed(1);
    const pos = p.position ? Math.round(p.position * 10) / 10 : null;
    return `${i + 1}. 【${p.title}】\n   クリック: ${p.clicks}件 / 表示: ${p.impressions}件 / CTR: ${pct}% / 順位: ${pos != null ? pos + '位' : '不明'}${p.keyword ? ` / KW: ${p.keyword}` : ''}`;
  }).join('\n\n');

  const prompt = `あなたは日本語のSEOコンテンツ専門家です。
以下は直近90日間のGSCデータでクリックが最も多かった上位${top10.length}本のコラム記事です。
各記事について「なぜこのコラムが高パフォーマンスなのか」を、SEOの観点から2〜3文で簡潔に分析してください。

【サイト】${siteId === 'nurube' ? '塗装屋ぬりべえ（外壁塗装専門）' : 'ハウジング重兵衛（住宅リフォーム）'}

${listText}

JSON形式で返してください（コードブロック不要）:
{"analyses":[{"rank":1,"reason":"..."},{"rank":2,"reason":"..."},...]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) return null;

  const d = await res.json();
  const text = d.content?.[0]?.text || '';
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(cleaned.slice(s, e + 1));
    prisma.seoFetchLog.create({ data: { siteId: `ca_best_${siteId}`, status: 'success', count: 1 } }).catch(() => {});
    return parsed.analyses || null;
  } catch { return null; }
}

// ── POST /api/best-columns/analyze ────────────────────────────────────────
export async function POST(request) {
  try {
    const { siteId = 'jube' } = await request.json();

    // 1. サイトマップ・DB・GSC を並列取得
    const [sitemapEntries, dbMap, gscRows] = await Promise.all([
      fetchSitemap(siteId),
      fetchDbMap(siteId),
      fetchGSC(siteId).catch(() => []),
    ]);

    if (sitemapEntries.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'コラムのサイトマップが取得できませんでした（column-sitemap.xml）',
      }, { status: 502 });
    }

    // 2. GSCをURLマップに（全バリアント登録）
    const gscMap = new Map();
    for (const row of gscRows) {
      for (const v of urlVariants(row.url)) {
        if (!gscMap.has(v)) gscMap.set(v, row);
      }
    }

    // 3. サイトマップ全エントリにDB・GSCの情報を付与
    const enriched = sitemapEntries.map(entry => {
      // DBから title / keyword / date を検索
      let dbEntry = null;
      for (const v of urlVariants(entry.url)) {
        if (dbMap.has(v)) { dbEntry = dbMap.get(v); break; }
      }
      // GSCからメトリクスを検索
      let gsc = null;
      for (const v of urlVariants(entry.url)) {
        if (gscMap.has(v)) { gsc = gscMap.get(v); break; }
      }

      const title = dbEntry?.title || slugFromUrl(entry.url);
      const date  = dbEntry?.date  || entry.date || '';

      return {
        url:         entry.url,
        title,
        date,
        keyword:     dbEntry?.keyword || '',
        clicks:      gsc?.clicks      || 0,
        impressions: gsc?.impressions || 0,
        ctr:         gsc?.ctr         || 0,
        position:    gsc?.position    || 0,
      };
    });

    // 4. クリック数降順でtop10
    enriched.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const top10 = enriched.slice(0, 10);

    // 5. Claude分析
    const analyses = await analyzeWithClaude(top10, siteId);

    // 6. 結合
    const ranking = top10.map((p, i) => ({
      rank:        i + 1,
      title:       p.title,
      url:         p.url,
      date:        p.date,
      clicks:      p.clicks,
      impressions: p.impressions,
      ctr:         p.ctr,
      position:    p.position,
      keyword:     p.keyword,
      aiReason:    analyses?.find(a => a.rank === i + 1)?.reason || null,
    }));

    return NextResponse.json({
      success:   true,
      ranking,
      total:     sitemapEntries.length,  // サイトマップ上の全コラム数
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API/best-columns/analyze POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
