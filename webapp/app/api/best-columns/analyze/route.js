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
const COLUMN_PATH_PATTERNS = ['/column', '/columns', '/blog', '/article', '/post', '/news', '/topics'];
const SITEMAP_URLS = {
  jube:   'https://jube.co.jp/column-sitemap.xml',
  nurube: 'https://nuribe.jp/column-sitemap.xml',
};

// ── GSCデータ取得（90日・全コラムURL） ──────────────────────────────────
async function fetchGSC(siteId) {
  const siteUrl = SITE_URLS[siteId];
  if (!siteUrl) return [];

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 89);
  const fmt = d => d.toISOString().slice(0, 10);

  const token = await getGoogleAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate:  fmt(startDate),
        endDate:    fmt(endDate),
        dimensions: ['page'],
        rowLimit:   1000,
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error('[best-columns] GSC error:', res.status, errText.slice(0, 200));
    return [];
  }

  const data   = await res.json();
  const rows   = data.rows || [];
  const domain = DOMAIN_PATTERNS[siteId];

  // コラムURLに絞る（パターンマッチ or ドメイン全体）
  const filtered = rows.filter(r => {
    const url = r.keys[0] || '';
    if (!url.includes(domain)) return false;
    return COLUMN_PATH_PATTERNS.some(p => url.includes(p));
  });

  const result = filtered.length > 0 ? filtered : rows.filter(r => (r.keys[0] || '').includes(domain));

  return result.map(r => ({
    url:         r.keys[0],
    clicks:      r.clicks      || 0,
    impressions: r.impressions || 0,
    ctr:         r.ctr         || 0,
    position:    r.position    || 0,
  }));
}

// ── サイトマップからURL→タイトルマップ作成 ──────────────────────────────
async function fetchSitemapTitleMap(siteId) {
  const map = new Map();
  try {
    const res = await fetch(SITEMAP_URLS[siteId] || '', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RE-WRITE/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return map;
    const xml    = await res.text();
    const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
    for (const block of blocks) {
      const loc     = (block.match(/<loc>\s*(.*?)\s*<\/loc>/)     || [])[1]?.trim() || '';
      const lastmod = (block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/) || [])[1]?.trim() || '';
      if (!loc) continue;
      // タイトルはslugから（後でDBで上書き）
      let title = '';
      try {
        const segs = new URL(loc).pathname.split('/').filter(Boolean);
        title = decodeURIComponent(segs[segs.length - 1] || '');
      } catch {}
      map.set(loc, { title, date: lastmod });
      // trailing-slash 両方登録
      const alt = loc.endsWith('/') ? loc.slice(0, -1) : loc + '/';
      if (!map.has(alt)) map.set(alt, { title, date: lastmod });
    }
  } catch (e) {
    console.warn('[best-columns] sitemap error:', e.message);
  }
  return map;
}

// ── DBからURL→タイトル/キーワードマップ ────────────────────────────────
async function fetchDbTitleMap(siteId) {
  const map = new Map();
  const items = await prisma.contentItem.findMany({
    where: {
      job: { siteId, jobType: 'column', deletedAt: null },
      generatedTitle: { not: null },
      postResult: { wpUrl: { not: null } },
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
      date:    item.postResult?.wpPublishedAt?.toISOString() || item.createdAt.toISOString(),
    };
    map.set(url, entry);
    const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/';
    if (!map.has(alt)) map.set(alt, entry);
  }
  return map;
}

// ── URLからスラグでタイトル推定 ─────────────────────────────────────────
function titleFromUrl(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return decodeURIComponent(segs[segs.length - 1] || url);
  } catch {
    return url;
  }
}

// ── Claude AI分析 ─────────────────────────────────────────────────────────
async function analyzeWithClaude(top10, siteId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const listText = top10.map((p, i) => {
    const pct = Math.round((p.ctr || 0) * 1000) / 10;
    const pos  = p.position ? Math.round(p.position * 10) / 10 : null;
    return `${i + 1}. 【${p.title}】
   クリック: ${p.clicks}件 / 表示: ${p.impressions}件 / CTR: ${pct}% / 順位: ${pos != null ? pos + '位' : '不明'}${p.keyword ? ` / KW: ${p.keyword}` : ''}`;
  }).join('\n\n');

  const prompt = `あなたは日本語のSEOコンテンツ専門家です。
以下は直近90日間でGoogleからのクリックが最も多かった上位${top10.length}本のコラム記事です。
各記事について「なぜこのコラムが高パフォーマンスなのか」を、SEOの観点から2〜3文で簡潔に分析してください。

【サイト】${siteId === 'nurube' ? '塗装屋ぬりべえ（外壁塗装専門）' : 'ハウジング重兵衛（住宅リフォーム）'}

${listText}

JSON形式で返してください（コードブロック不要）:
{"analyses":[{"rank":1,"reason":"..."},{"rank":2,"reason":"..."},...]}`  ;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) return null;

  const d    = await res.json();
  const text = d.content?.[0]?.text || '';
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(cleaned.slice(s, e + 1));
    prisma.seoFetchLog.create({ data: { siteId: `ca_best_${siteId}`, status: 'success', count: 1 } }).catch(() => {});
    return parsed.analyses || null;
  } catch {
    return null;
  }
}

// ── POST /api/best-columns/analyze ────────────────────────────────────────
export async function POST(request) {
  try {
    const { siteId = 'jube' } = await request.json();

    // 1. GSC（主軸）+ タイトル解決用データを並列取得
    const [gscRows, sitemapMap, dbMap] = await Promise.all([
      fetchGSC(siteId),
      fetchSitemapTitleMap(siteId).catch(() => new Map()),
      fetchDbTitleMap(siteId).catch(() => new Map()),
    ]);

    if (gscRows.length === 0) {
      return NextResponse.json({ success: false, error: 'GSCデータが取得できませんでした。Search Consoleの権限を確認してください。' }, { status: 502 });
    }

    // 2. GSCの各URLにタイトル・日付・キーワードを付与（DB優先 → サイトマップ → URL slug）
    const enriched = gscRows.map(row => {
      const db  = dbMap.get(row.url);
      const sm  = sitemapMap.get(row.url);
      return {
        url:         row.url,
        clicks:      row.clicks,
        impressions: row.impressions,
        ctr:         row.ctr,
        position:    row.position,
        title:       db?.title   || sm?.title   || titleFromUrl(row.url),
        date:        db?.date    || sm?.date    || '',
        keyword:     db?.keyword || '',
      };
    });

    // 3. クリック数降順でtop10
    enriched.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const top10 = enriched.slice(0, 10);

    // 4. Claude分析
    const analyses = await analyzeWithClaude(top10, siteId);

    // 5. 結合して返す
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
      total:     gscRows.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API/best-columns/analyze POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
