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
      let loc       = (block.match(/<loc>\s*(.*?)\s*<\/loc>/)         || [])[1]?.trim() || '';
      let lastmod   = (block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/) || [])[1]?.trim() || '';
      // CDATA除去（loc / lastmod 両方）
      const stripCdata = s => s.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
      loc     = stripCdata(loc);
      lastmod = stripCdata(lastmod);
      if (!loc || !loc.startsWith('http')) return null;
      return { url: loc, date: lastmod };
    }).filter(Boolean);
  } catch (e) {
    console.warn('[best-columns] sitemap error:', e.message);
    return [];
  }
}

// ── DB からURL→{title, keyword, date}マップ + 件数 ────────────────────────
// column-analysis/posts と同条件（status posted|generated, take 200）で件数を揃える
async function fetchDbItems(siteId) {
  const map = new Map();
  let itemCount  = 0;
  let urlsInDb   = new Set();
  try {
    const items = await prisma.contentItem.findMany({
      where: {
        job: { siteId, jobType: 'column', deletedAt: null },
        status: { in: ['posted', 'generated'] },
        generatedTitle: { not: null },
      },
      select: {
        generatedTitle: true,
        createdAt:      true,
        job:            { select: { meta: true } },
        postResult:     { select: { wpUrl: true, wpPublishedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take:    200,
    });
    itemCount = items.length;
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
      urlsInDb.add(url);
    }
  } catch (e) {
    console.warn('[best-columns] DB error:', e.message);
  }
  return { map, itemCount, urlsInDb };
}

// ── TOP10 のWPページから <title>・公開日 を取得 ──────────────────────────
// og:title → <title>（サイト名サフィックス除去） / article:published_time
async function fetchWpMeta(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pwrite/1.0)' },
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // og:title（property の前後 content どちらでもマッチ）
    const og =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] || null;

    let title = og && decodeEntities(og);
    if (!title) {
      const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      if (raw) title = decodeEntities(raw).split(/\s*[|｜\-–—]\s*/)[0].trim();
    }

    const published =
      html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i)?.[1] || null;

    return { title: title || null, date: published || null };
  } catch {
    return null;
  }
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
    const pct  = (Math.round((p.ctr || 0) * 1000) / 10).toFixed(1);
    const pos  = p.position ? Math.round(p.position * 10) / 10 : null;
    const cpd  = (Math.round((p.clicksPerDay || 0) * 10) / 10).toFixed(1);
    const date = p.date ? p.date.slice(0, 10) : '不明';
    return `${i + 1}. 【${p.title}】\n   公開: ${date} / クリック: ${p.clicks}件 (${cpd}/日) / 表示: ${p.impressions}件 / CTR: ${pct}% / 順位: ${pos != null ? pos + '位' : '不明'}${p.keyword ? ` / KW: ${p.keyword}` : ''}`;
  }).join('\n\n');

  const prompt = `あなたは日本語のSEOコンテンツ専門家です。
以下は直近90日間のGSCデータを「クリック/日（公開日で正規化）」で評価した上位${top10.length}本のコラム記事です。新着でも勢いがあれば上位に来る評価方式のため、累計クリックではなく「公開からの日数あたりのクリック効率」と「タイトル・キーワードの妥当性」を評価軸にしてください。
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
    const [sitemapEntries, dbResult, gscRows] = await Promise.all([
      fetchSitemap(siteId),
      fetchDbItems(siteId),
      fetchGSC(siteId).catch(() => []),
    ]);
    const { map: dbMap, itemCount: dbItemCount, urlsInDb } = dbResult;

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

    // 4. 「クリック/日」降順でtop10（新着コラムも評価対象に）
    //    公開からの日数が短すぎると分母が小さくなりすぎるため最低14日でクリップ
    const MIN_DAYS    = 14;
    const MS_PER_DAY  = 1000 * 60 * 60 * 24;
    const nowMs       = Date.now();
    const clicksPerDay = (p) => {
      if (!p.clicks) return 0;
      const t = p.date ? Date.parse(p.date) : NaN;
      const days = Number.isFinite(t)
        ? Math.max(MIN_DAYS, (nowMs - t) / MS_PER_DAY)
        : MIN_DAYS * 4; // 日付不明はニュートラル扱い
      return p.clicks / days;
    };
    for (const p of enriched) p.clicksPerDay = clicksPerDay(p);
    enriched.sort((a, b) => b.clicksPerDay - a.clicksPerDay || b.clicks - a.clicks);
    const top10 = enriched.slice(0, 10);

    // 4-b. TOP10だけWPページから正式タイトル・公開日を取得（DBにあっても上書き）
    //    サイト固有の定型プレフィックス（「重兵衛コラム。」等）は除去
    const TITLE_PREFIX = {
      jube:   /^重兵衛コラム。\s*/,
      nurube: /^ぬりべえコラム。\s*/,
    };
    const prefixRe = TITLE_PREFIX[siteId];
    const metas = await Promise.all(top10.map(p => fetchWpMeta(p.url)));
    metas.forEach((m, i) => {
      if (!m) return;
      if (m.title) {
        const cleaned = prefixRe ? m.title.replace(prefixRe, '').trim() : m.title;
        if (cleaned) top10[i].title = cleaned;
      }
      if (m.date) {
        top10[i].date          = m.date;
        top10[i].clicksPerDay  = clicksPerDay(top10[i]); // 実公開日で再計算
      }
    });

    // 5. Claude分析
    const analyses = await analyzeWithClaude(top10, siteId);

    // 6. 結合
    const ranking = top10.map((p, i) => ({
      rank:         i + 1,
      title:        p.title,
      url:          p.url,
      date:         p.date,
      clicks:       p.clicks,
      clicksPerDay: Math.round((p.clicksPerDay || 0) * 10) / 10,
      impressions:  p.impressions,
      ctr:          p.ctr,
      position:     p.position,
      keyword:      p.keyword,
      aiReason:     analyses?.find(a => a.rank === i + 1)?.reason || null,
    }));

    // 件数: コラム分析/posts と同方式（DB全件 + サイトマップのDB未登録分）
    const sitemapNotInDb = sitemapEntries.filter(e => !urlsInDb.has(e.url)).length;
    const total = dbItemCount + sitemapNotInDb;

    return NextResponse.json({
      success:   true,
      ranking,
      total,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API/best-columns/analyze POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
