import { NextResponse } from 'next/server';
import { prisma }           from '@/lib/db';
import { getGoogleAccessToken } from '@/lib/googleAuth';

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

// ── DB + サイトマップからコラム一覧取得 ──────────────────────────────────
async function fetchPosts(siteId) {
  const items = await prisma.contentItem.findMany({
    where: {
      job: { siteId, jobType: 'column', deletedAt: null },
      status: { in: ['posted', 'generated'] },
      generatedTitle: { not: null },
    },
    select: {
      id: true, generatedTitle: true, generatedBody: true,
      generatedMeta: true, createdAt: true, status: true,
      job: { select: { meta: true } },
      postResult: { select: { wpPostId: true, wpUrl: true, postStatus: true, wpPublishedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const dbPosts = items.map(item => {
    const meta    = item.generatedMeta || {};
    const jobMeta = item.job?.meta     || {};
    const excerpt = item.generatedBody
      ? item.generatedBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
      : String(meta.summary || meta.description || '');
    return {
      id:      item.id,
      title:   item.generatedTitle || '',
      url:     item.postResult?.wpUrl || '',
      date:    item.postResult?.wpPublishedAt?.toISOString() || item.createdAt.toISOString(),
      excerpt,
      keyword: jobMeta.keyword || '',
    };
  });

  const dbUrls = new Set(dbPosts.filter(p => p.url).map(p => p.url));

  // サイトマップ補完
  let sitemapPosts = [];
  try {
    const res = await fetch(SITEMAP_URLS[siteId] || '', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RE-WRITE/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
      sitemapPosts = blocks.map(block => {
        const loc     = (block.match(/<loc>\s*(.*?)\s*<\/loc>/) || [])[1]?.trim() || '';
        const lastmod = (block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/) || [])[1]?.trim() || '';
        let title = '';
        try {
          const segs = new URL(loc).pathname.split('/').filter(Boolean);
          title = decodeURIComponent(segs[segs.length - 1] || '');
        } catch {}
        return { id: `sm-${loc}`, title, url: loc, date: lastmod, excerpt: '', keyword: '' };
      }).filter(p => p.url && p.title && !dbUrls.has(p.url));
    }
  } catch {}

  return [...dbPosts, ...sitemapPosts];
}

// ── GSCデータ取得（90日） ─────────────────────────────────────────────────
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
      body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['page'], rowLimit: 1000 }),
    }
  );
  if (!res.ok) return [];

  const data  = await res.json();
  const rows  = data.rows || [];
  const domain = DOMAIN_PATTERNS[siteId];

  return rows
    .filter(r => {
      const url = r.keys[0] || '';
      if (!url.includes(domain)) return false;
      return COLUMN_PATH_PATTERNS.some(p => url.includes(p));
    })
    .map(r => ({
      url:         r.keys[0],
      clicks:      r.clicks      || 0,
      impressions: r.impressions || 0,
      ctr:         r.ctr         || 0,
      position:    r.position    || 0,
    }));
}

// ── Claude AI分析 ─────────────────────────────────────────────────────────
async function analyzeWithClaude(top10, siteId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const listText = top10.map((p, i) => {
    const pct = Math.round((p.ctr || 0) * 100 * 10) / 10;
    const pos  = p.position ? Math.round(p.position * 10) / 10 : null;
    return `${i + 1}. 【${p.title}】
   URL: ${p.url}
   クリック数: ${p.clicks}件 / 表示回数: ${p.impressions}件 / CTR: ${pct}% / 平均順位: ${pos != null ? pos + '位' : '不明'}${p.keyword ? ` / キーワード: ${p.keyword}` : ''}`;
  }).join('\n\n');

  const prompt = `あなたは日本語のSEOコンテンツ専門家です。
以下は直近90日間でGoogleからのクリックが最も多かった上位${top10.length}本のコラム記事です。
各記事について「なぜこのコラムが高パフォーマンスなのか」を、SEOの観点から2〜3文で簡潔に分析してください。

【サイト】${siteId === 'nurube' ? '塗装屋ぬりべえ（外壁塗装専門）' : 'ハウジング重兵衛（住宅リフォーム）'}

${listText}

以下のJSON形式で返してください（コードブロック不要）:
{
  "analyses": [
    { "rank": 1, "reason": "...2〜3文の分析..." },
    { "rank": 2, "reason": "..." },
    ...
  ]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return null;

  const d    = await res.json();
  const text = d.content?.[0]?.text || '';
  try {
    const cleaned  = text.replace(/```json|```/g, '').trim();
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(cleaned.slice(s, e + 1));
    // コスト記録
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

    // 1. 記事一覧 & GSC並列取得
    const [posts, gscRows] = await Promise.all([
      fetchPosts(siteId),
      fetchGSC(siteId).catch(() => []),
    ]);

    // 2. URLでJOIN
    const gscMap = new Map(gscRows.map(r => [r.url, r]));

    const merged = posts
      .filter(p => p.url)
      .map(p => {
        const g = gscMap.get(p.url) || {};
        return {
          ...p,
          clicks:      g.clicks      || 0,
          impressions: g.impressions || 0,
          ctr:         g.ctr         || 0,
          position:    g.position    || null,
        };
      });

    // 3. クリック数降順でtop10
    merged.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const top10 = merged.slice(0, 10);

    if (top10.length === 0) {
      return NextResponse.json({ success: false, error: '記事が見つかりませんでした' }, { status: 404 });
    }

    // 4. Claude分析
    const analyses = await analyzeWithClaude(top10, siteId);

    // 5. 結合して返す
    const result = top10.map((p, i) => ({
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

    return NextResponse.json({ success: true, ranking: result, total: merged.length });
  } catch (err) {
    console.error('[API/best-columns/analyze POST]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
