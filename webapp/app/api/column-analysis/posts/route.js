import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// サイトマップURL
const SITEMAP_URLS = {
  jube:   'https://jube.co.jp/column-sitemap.xml',
  nurube: 'https://nuribe.jp/column-sitemap.xml',
};

// column-sitemap.xml をパースして { url, date, title } の配列を返す
async function fetchFromSitemap(siteId) {
  const sitemapUrl = SITEMAP_URLS[siteId];
  if (!sitemapUrl) return [];

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RE-WRITE/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.log(`[posts] sitemap HTTP ${res.status} (${siteId})`);
      return [];
    }

    const xml = await res.text();

    // <url>...</url> ブロックを全て抽出
    const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];

    const results = urlBlocks.map(block => {
      const locMatch     = block.match(/<loc>\s*(.*?)\s*<\/loc>/);
      const lastmodMatch = block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/);

      const url     = locMatch     ? locMatch[1].trim()     : '';
      const lastmod = lastmodMatch ? lastmodMatch[1].trim() : '';

      // URLの最後のセグメントをデコードしてタイトルに使用
      let title = '';
      try {
        const pathname  = new URL(url).pathname;
        const segments  = pathname.split('/').filter(Boolean);
        const slug      = segments[segments.length - 1] || '';
        title = decodeURIComponent(slug);
      } catch {}

      return { url, date: lastmod, title };
    }).filter(item => item.url && item.title);

    console.log(`[posts] sitemap取得: ${results.length}件 (${siteId})`);
    return results;
  } catch (e) {
    console.log(`[posts] sitemap失敗 (${siteId}): ${e.message}`);
    return [];
  }
}

// GET /api/column-analysis/posts?siteId=jube
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';

    // ─── Step 1: DBからコラムアイテムを取得 ───────────────────────────
    const items = await prisma.contentItem.findMany({
      where: {
        job: {
          siteId,
          jobType:   'column',
          deletedAt: null,
        },
        status: { in: ['posted', 'generated'] },
        generatedTitle: { not: null },
      },
      select: {
        id:             true,
        generatedTitle: true,
        generatedBody:  true,
        generatedMeta:  true,
        createdAt:      true,
        status:         true,
        job: {
          select: { meta: true, siteId: true },
        },
        postResult: {
          select: {
            wpPostId:      true,
            wpUrl:         true,
            postStatus:    true,
            wpPublishedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const dbPosts = items.map(item => {
      const meta    = item.generatedMeta || {};
      const jobMeta = item.job?.meta     || {};

      const bodyText = item.generatedBody
        ? item.generatedBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
        : String(meta.summary || meta.description || '');

      return {
        id:      item.id,
        title:   item.generatedTitle || '',
        url:     item.postResult?.wpUrl || '',
        date:    item.postResult?.wpPublishedAt?.toISOString()
                   || item.createdAt.toISOString(),
        excerpt: bodyText,
        status:  item.postResult?.postStatus || item.status,
        keyword: jobMeta.keyword || '',
        source:  'db',
      };
    });

    // DBにある記事URLのセット（重複排除用）
    const dbUrls = new Set(dbPosts.filter(p => p.url).map(p => p.url));

    // ─── Step 2: サイトマップから追加取得 ────────────────────────────
    let sitemapMerged = [];
    try {
      const sitemapItems = await fetchFromSitemap(siteId);

      sitemapMerged = sitemapItems
        // DBに既にある記事は除外
        .filter(item => !dbUrls.has(item.url))
        .map((item, i) => ({
          id:      `sitemap-${siteId}-${i}`,
          title:   item.title,
          url:     item.url,
          date:    item.date,
          excerpt: '',
          status:  'wp-published',
          keyword: '',
          source:  'wp',
        }));

      console.log(`[posts] サイトマップ追加: ${sitemapMerged.length}件 (DB重複除外後, ${siteId})`);
    } catch (e) {
      console.warn(`[posts] サイトマップ処理エラー (${siteId}):`, e.message);
    }

    // ─── Step 3: マージして返す ──────────────────────────────────────
    const posts = [...dbPosts, ...sitemapMerged];

    return NextResponse.json({ success: true, posts, total: posts.length });
  } catch (err) {
    console.error('[API/column-analysis/posts GET]', err);
    return NextResponse.json({ success: false, error: '記事取得に失敗しました' }, { status: 500 });
  }
}
