import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/column-analysis/posts?siteId=jube
// DB (ContentItem) からコラム記事一覧を取得（WP REST API を直接叩かない）
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || 'jube';

    // コラムジョブのアイテムを取得（投稿済みのもの優先、下書きも含む）
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
    const posts = items.map(item => {
      const meta    = item.generatedMeta || {};
      const jobMeta = item.job?.meta     || {};

      // 本文から excerpt を生成（HTMLタグ除去、先頭300文字）
      // generatedMeta の summary/description は object の場合があるので String() で変換
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
        keyword: jobMeta.keyword || '',       // コラム生成時のキーワード
      };
    });

    return NextResponse.json({ success: true, posts, total: posts.length });
  } catch (err) {
    console.error('[API/column-analysis/posts GET]', err);
    return NextResponse.json({ success: false, error: '記事取得に失敗しました' }, { status: 500 });
  }
}
