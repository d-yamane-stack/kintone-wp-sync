import { NextResponse }          from 'next/server';
import { prisma }                from '@/lib/db';
import { getGoogleAccessToken }  from '@/lib/googleAuth';

export const maxDuration = 60;

const SITE_URLS = {
  jube:   process.env.GSC_SITE_URL_JUBE   || 'https://jube.co.jp/',
  nurube: process.env.GSC_SITE_URL_NURUBE || 'https://nuribe.jp/',
};
const SITE_WP_BASE = {
  jube:   'https://jube.co.jp',
  nurube: 'https://nuribe.jp',
};
const DOMAIN_PATTERNS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};
const COLUMN_PATH_PATTERNS = ['/column', '/columns', '/blog', '/article', '/post', '/news', '/topics'];

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

  // コラムURLに絞る
  const filtered = rows.filter(r => {
    const url = r.keys[0] || '';
    if (!url.includes(domain)) return false;
    return COLUMN_PATH_PATTERNS.some(p => url.includes(p));
  });

  // フォールバックなし：パターン一致のみ返す（非コラムページを混入させない）
  return filtered.map(r => ({
    url:         r.keys[0],
    clicks:      r.clicks      || 0,
    impressions: r.impressions || 0,
    ctr:         r.ctr         || 0,
    position:    r.position    || 0,
  }));
}

// ── DBからURL→タイトル/キーワード/日付マップ ────────────────────────────
async function fetchDbMap(siteId) {
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
      date:    (item.postResult?.wpPublishedAt || item.createdAt)?.toISOString?.() || '',
    };
    // trailing-slash 両方登録
    map.set(url, entry);
    const alt = url.endsWith('/') ? url.slice(0, -1) : url + '/';
    if (!map.has(alt)) map.set(alt, entry);
  }
  return map;
}

// ── WP REST APIでタイトル・日付を一括取得 ────────────────────────────────
// スラグを抽出 → /wp-json/wp/v2/posts?slug=xxx で公開記事を読み取る
async function enrichFromWpApi(items, siteId) {
  const base = SITE_WP_BASE[siteId];
  if (!base) return items;

  const results = await Promise.all(
    items.map(async (item) => {
      // タイトル・日付が既に揃っていれば呼ばない
      if (item.title && !looksLikeSlug(item.title) && item.date) return item;

      const slug = extractSlug(item.url);
      if (!slug) return item;

      try {
        const res = await fetch(
          `${base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=title,date&per_page=1`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pwrite/1.0)' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) return item;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return item;
        const wp = data[0];
        return {
          ...item,
          title: (wp.title?.rendered || item.title || slug).replace(/&#[0-9]+;|&amp;|&lt;|&gt;|&quot;/g, s => {
            const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' };
            return map[s] || s;
          }),
          date: wp.date || item.date,
        };
      } catch {
        return item;
      }
    })
  );
  return results;
}

function extractSlug(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] || '';
  } catch {
    return '';
  }
}

// スラグっぽい文字列（日本語なし、数字・英数字のみ）かどうか
function looksLikeSlug(str) {
  return /^[a-zA-Z0-9_\-]+$/.test(str);
}

// ── Claude AI分析 ─────────────────────────────────────────────────────────
async function analyzeWithClaude(top10, siteId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const listText = top10.map((p, i) => {
    const pct = (Math.round((p.ctr || 0) * 1000) / 10).toFixed(1);
    const pos  = p.position ? Math.round(p.position * 10) / 10 : null;
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

    // 1. GSC + DBを並列取得
    const [gscRows, dbMap] = await Promise.all([
      fetchGSC(siteId),
      fetchDbMap(siteId).catch(() => new Map()),
    ]);

    if (gscRows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'GSCデータが取得できませんでした。Search Consoleの権限を確認してください。',
      }, { status: 502 });
    }

    // 2. クリック数降順でtop10を先に絞る（WP API呼び出しを最小化）
    gscRows.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const top10Gsc = gscRows.slice(0, 10);

    // 3. DBでタイトル/日付/キーワードを補完
    const enrichedFromDb = top10Gsc.map(row => {
      const db = dbMap.get(row.url);
      return {
        ...row,
        title:   db?.title   || '',
        date:    db?.date    || '',
        keyword: db?.keyword || '',
      };
    });

    // 4. タイトル or 日付が欠けている場合 → WP REST APIで補完
    const top10 = await enrichFromWpApi(enrichedFromDb, siteId);

    // 5. それでも title が空なら slug をフォールバック表示
    const top10Final = top10.map(p => ({
      ...p,
      title: p.title || extractSlug(p.url) || p.url,
    }));

    // 6. Claude分析
    const analyses = await analyzeWithClaude(top10Final, siteId);

    // 7. 結合して返す
    const ranking = top10Final.map((p, i) => ({
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
