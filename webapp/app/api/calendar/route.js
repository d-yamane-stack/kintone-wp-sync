import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 常に最新のDB内容を返す（App Router のGETキャッシュを無効化）
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// UTC日時 → JST(+9h)の 'YYYY-MM-DD'。カレンダーの日付バケツキーに使う。
// DBのDateTimeはUTC保存のため、JSTの暦日に揃えてからキー化する。
function jstDateKey(d) {
  if (!d) return null;
  const t = new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000);
  if (isNaN(t)) return null;
  return t.toISOString().slice(0, 10);
}

// GET /api/calendar — 投稿カレンダー用イベント一覧
// コラム生成(column)とリライト(rewrite / rewrite_post)を対象に、
// 直近約14ヶ月分のイベントを返す。月送り表示はクライアント側で行う。
export async function GET() {
  try {
    // 予約投稿(future)の公開日は startedAt より未来になり得るが、その生成ジョブ自体は
    // 直近に作られるため startedAt の下限フィルタで取りこぼさない。
    const since = new Date(Date.now() - 430 * 24 * 60 * 60 * 1000); // 約14ヶ月前

    const jobs = await prisma.contentJob.findMany({
      where: {
        deletedAt: null,
        jobType:   { in: ['column', 'rewrite', 'rewrite_post'] },
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true, siteId: true, jobType: true, status: true, startedAt: true, meta: true,
        contentItems: {
          select: {
            id: true, status: true, generatedTitle: true, createdAt: true,
            postResult: { select: { wpEditUrl: true, wpUrl: true, postStatus: true, wpPublishedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const events = [];

    for (const j of jobs) {
      const isRewrite = j.jobType === 'rewrite' || j.jobType === 'rewrite_post';
      const meta = j.meta || {};

      if (isRewrite) {
        // リライトは最新の content_item 1件をイベント化
        const it = j.contentItems[0] || null;
        const pr = it && it.postResult ? it.postResult : null;
        // 状態: publish(公開済み) / posting(反映待ち) / error / manual(手動コピー)
        let status = 'manual';
        if (j.jobType === 'rewrite_post') {
          if (pr)                        status = 'publish';
          else if (j.status === 'error') status = 'error';
          else                           status = 'posting';
        }
        // 公開日 > content_item作成日 > ジョブ開始日 の優先で日付を決める
        const dateKey = jstDateKey((pr && pr.wpPublishedAt) || (it && it.createdAt) || j.startedAt);
        if (!dateKey) continue;
        events.push({
          type:      'rewrite',
          dateKey,
          siteId:    j.siteId,
          status,
          title:     (it && it.generatedTitle) || meta.newTitle || meta.originalTitle || '(無題)',
          wpEditUrl: (pr && pr.wpEditUrl) || '',
          wpUrl:     (pr && pr.wpUrl) || meta.originalUrl || '',
        });
        continue;
      }

      // コラムは content_item 単位でイベント化（生成済み or 投稿結果あり or エラー）
      for (const it of j.contentItems) {
        const pr = it.postResult || null;
        if (!it.generatedTitle && !pr && it.status !== 'error') continue;
        // 状態: draft / publish / future（WPステータス）。未投稿は draft、失敗は error。
        let status;
        if (it.status === 'error')    status = 'error';
        else if (pr && pr.postStatus) status = pr.postStatus;
        else                          status = 'draft';
        // 公開/予約は公開日、下書きは生成日（startedAt）に置く
        const dateKey = jstDateKey((pr && pr.wpPublishedAt) || j.startedAt);
        if (!dateKey) continue;
        events.push({
          type:      'column',
          dateKey,
          siteId:    j.siteId,
          status,
          title:     it.generatedTitle || meta.keyword || '(無題)',
          wpEditUrl: (pr && pr.wpEditUrl) || '',
          wpUrl:     (pr && pr.wpUrl) || '',
        });
      }
    }

    return NextResponse.json({ success: true, events });
  } catch (err) {
    console.error('[API/calendar GET]', err);
    return NextResponse.json({ success: false, error: 'カレンダーデータの取得に失敗しました' }, { status: 500 });
  }
}
