import { NextResponse }          from 'next/server';
import { prisma }                from '@/lib/db';
import { getGoogleAccessToken }  from '@/lib/googleAuth';
import { workerFetch }           from '@/lib/workerFetch';

export const maxDuration = 60;

const SITE_URLS = {
  jube:   process.env.GSC_SITE_URL_JUBE   || 'https://jube.co.jp/',
  nurube: process.env.GSC_SITE_URL_NURUBE || 'https://nuribe.jp/',
};
const DOMAIN_PATTERNS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};

// ── 全WPコラムをworker経由で取得（ページネーション） ─────────────────────
async function fetchAllWpColumns(siteId) {
  const all = [];
  for (let page = 1; page <= 20; page++) {  // 最大2000件
    try {
      const res  = await workerFetch(`/api/wp/posts?siteId=${siteId}&page=${page}&perPage=100`);
      if (!res.ok) break;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.posts) || data.posts.length === 0) break;
      all.push(...data.posts);
      if (data.posts.length < 100) break;
    } catch (e) {
      console.error('[best-columns] worker fetch error page', page, e.message);
      break;
    }
  }
  return all;
}

// ── GSCデータ取得（90日） ────────────────────────────────────────────────
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
        rowLimit:   2000,
      }),
    }
  );
  if (!res.ok) return [];

  const data = await res.json();
  const rows = data.rows || [];
  const domain = DOMAIN_PATTERNS[siteId];

  return rows
    .filter(r => (r.keys[0] || '').includes(domain))
    .map(r => ({
      url:         r.keys[0],
      clicks:      r.clicks      || 0,
      impressions: r.impressions || 0,
      ctr:         r.ctr         || 0,
      position:    r.position    || 0,
    }));
}

// ── DB側からキーワード情報を取得（補助） ────────────────────────────────
async function fetchDbKeywordMap(siteId) {
  const map = new Map();
  try {
    const items = await prisma.contentItem.findMany({
      where: {
        job: { siteId, jobType: 'column', deletedAt: null },
        postResult: { wpUrl: { not: null } },
      },
      select: {
        job:        { select: { meta: true } },
        postResult: { select: { wpUrl: true } },
      },
    });
    for (const item of items) {
      const url = item.postResult?.wpUrl;
      const kw  = item.job?.meta?.keyword;
      if (!url || !kw) continue;
      for (const v of urlVariants(url)) map.set(v, kw);
    }
  } catch {}
  return map;
}

// ── URLの正規化バリアント生成 ──────────────────────────────────────────
function urlVariants(url) {
  const set = new Set();
  const add = (u) => {
    if (!u) return;
    set.add(u);
    set.add(u.endsWith('/') ? u.slice(0, -1) : u + '/');
  };
  add(url);
  try {
    const u = new URL(url);
    const decoded = u.origin + decodeURIComponent(u.pathname);
    add(decoded);
    const encoded = u.origin + u.pathname.split('/').map(s => s ? encodeURIComponent(decodeURIComponent(s)) : '').join('/');
    add(encoded);
  } catch {}
  return set;
}

// ── HTMLエンティティをデコード ──────────────────────────────────────────
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
以下は直近90日間でGoogleからのクリックが最も多かった上位${top10.length}本のコラム記事です。
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

    // 1. WP全コラム + GSC + DBキーワード を並列取得
    const [wpColumns, gscRows, dbKwMap] = await Promise.all([
      fetchAllWpColumns(siteId).catch(() => []),
      fetchGSC(siteId).catch(() => []),
      fetchDbKeywordMap(siteId).catch(() => new Map()),
    ]);

    if (wpColumns.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'WPからコラム記事が取得できませんでした。worker(server.js)の稼働を確認してください。',
      }, { status: 502 });
    }

    // 2. GSCをURL→metrics のマップへ（全バリアントで登録）
    const gscMap = new Map();
    for (const row of gscRows) {
      for (const v of urlVariants(row.url)) {
        if (!gscMap.has(v)) gscMap.set(v, row);
      }
    }

    // 3. WPコラムにGSCメトリクスを付与
    const enriched = wpColumns.map(p => {
      let g = null;
      for (const v of urlVariants(p.url)) {
        if (gscMap.has(v)) { g = gscMap.get(v); break; }
      }
      let kw = '';
      for (const v of urlVariants(p.url)) {
        if (dbKwMap.has(v)) { kw = dbKwMap.get(v); break; }
      }
      return {
        title:       decodeHtmlEntities(p.title || ''),
        url:         p.url,
        date:        p.date || '',
        clicks:      g?.clicks      || 0,
        impressions: g?.impressions || 0,
        ctr:         g?.ctr         || 0,
        position:    g?.position    || 0,
        keyword:     kw,
      };
    });

    // 4. クリック数降順でソート → top10
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
      total:     wpColumns.length,   // ← 全コラム数（WP側の正確な値）
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API/best-columns/analyze POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
