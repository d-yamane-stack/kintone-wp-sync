import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// サイトIDごとのWPドメイン
const WP_DOMAINS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};

// コラムURLパターン（GSC routeと共通）
const COLUMN_PATH_PATTERNS = ['/column', '/columns', '/blog', '/article', '/post', '/news', '/topics'];

// WP REST APIから記事を最大3ページ取得（失敗しても空配列を返す）
async function fetchWpPosts(domain) {
  const results = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await fetch(
        `https://${domain}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&_fields=id,title,link,date,excerpt`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) {
        console.log(`[API/column-analysis/posts] WP API page=${page} HTTP ${res.status}, stopping`);
        break;
      }
      const posts = await res.json();
      if (!Array.isArray(posts) || posts.length === 0) break;
      results.push(...posts);
      if (posts.length < 100) break; // 最終ページ
    } catch (e) {
      console.log(`[API/column-analysis/posts] WP API page=${page} error: ${e.message}, stopping`);
      break;
    }
  }
  return results;
}

// GET /api/column-analysis/posts?siteId=jube
// DB (ContentItem) からコラム記事一覧を取得し、WP REST APIからも追加取得してマージ
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
        id:            true,
        generatedTitle: true,
        generatedBody:  true,
        generatedMeta:  true,
        createdAt:     true,
        status:        true,
        job: {
          select: { meta: true, siteId: true },
        },
        postResult: {
          select: {
            wpPostId:     true,
            wpUrl:        true,
            postStatus:   true,
            wpPublishedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // 整形: 分析に必要な最小限のデータに変換
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

    // ─── Step 2: WP REST APIから追加取得 ─────────────────────────────
    const domain = WP_DOMAINS[siteId];
    let wpMerged = [];

    if (domain) {
      try {
        const wpRaw = await fetchWpPosts(domain);
        console.log(`[API/column-analysis/posts] WP API取得: ${wpRaw.length}件 (${siteId})`);

        wpMerged = wpRaw
          // コラムURLパターンに一致する記事のみ
          .filter(wp => {
            const url = wp.link || '';
            return COLUMN_PATH_PATTERNS.some(pat => url.includes(pat));
          })
          // DBにある記事（wpUrl一致）は除外
          .filter(wp => !dbUrls.has(wp.link))
          .map(wp => ({
            id:      `wp-${wp.id}`,
            title:   wp.title?.rendered || '',
            url:     wp.link || '',
            date:    wp.date || '',
            excerpt: (wp.excerpt?.rendered || '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
            status:  'wp-published',
            keyword: '',
            source:  'wp',
          }));

        console.log(`[API/column-analysis/posts] WP記事マージ対象: ${wpMerged.length}件 (コラムURL一致・DB重複除外後)`);
      } catch (wpErr) {
        // WP APIが失敗してもDBデータは返す
        console.warn(`[API/column-analysis/posts] WP API失敗 (${siteId}):`, wpErr.message);
      }
    }

    // ─── Step 3: マージして返す ──────────────────────────────────────
    const posts = [...dbPosts, ...wpMerged];

    return NextResponse.json({ success: true, posts, total: posts.length });
  } catch (err) {
    console.error('[API/column-analysis/posts GET]', err);
    return NextResponse.json({ success: false, error: '記事取得に失敗しました' }, { status: 500 });
  }
}
