import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/jobs/sync-wp — 表示中ジョブのWPステータスを一括同期
export async function POST() {
  try {
    // 削除済みを除く全ジョブ + サイト情報 + postResult を取得
    const jobs = await prisma.contentJob.findMany({
      where: { deletedAt: null },
      include: {
        site: true,
        contentItems: {
          include: { postResult: true },
          where:   { postResult: { isNot: null } },
        },
      },
    });

    let updated = 0;
    let skipped = 0;
    let errors  = 0;
    const debugLog = [];

    for (const job of jobs) {
      const site = job.site;
      if (!site || !site.wpBaseUrl || !site.wpUsername || !site.wpAppPassword) {
        debugLog.push(`[SKIP] siteId=${job.siteId} credentials missing (wpBaseUrl="${site?.wpBaseUrl}")`);
        skipped++;
        continue;
      }

      // コラムは 'column'、施工事例はサイト設定の postType を使用
      const restBase = job.jobType === 'column' ? 'column' : site.wpPostType;
      const baseUrl  = site.wpBaseUrl.replace(/\/$/, '');
      const auth     = 'Basic ' + Buffer.from(`${site.wpUsername}:${site.wpAppPassword}`).toString('base64');

      for (const item of job.contentItems) {
        const pr = item.postResult;
        if (!pr || !pr.wpPostId) { skipped++; continue; }

        try {
          const wpUrl = `${baseUrl}/wp-json/wp/v2/${restBase}/${pr.wpPostId}`;
          const wpRes = await fetch(wpUrl, { headers: { 'Authorization': auth }, cache: 'no-store' });

          if (!wpRes.ok) {
            debugLog.push(`[HTTP ${wpRes.status}] ${wpUrl} (currentDB=${pr.postStatus})`);
            if (wpRes.status === 404 && pr.postStatus !== 'wp_deleted') {
              // WP側で削除済み → ステータスを wp_deleted に更新
              await prisma.postResult.update({
                where: { id: pr.id },
                data: { postStatus: 'wp_deleted', wpPublishedAt: null },
              });
              updated++;
            } else {
              skipped++;
            }
            continue;
          }

          const wpData  = await wpRes.json();
          const newStatus = wpData.status || pr.postStatus;
          const newDate   = (newStatus === 'publish' || newStatus === 'future')
            ? (wpData.date ? new Date(wpData.date) : null)
            : null;

          debugLog.push(`[OK] ${wpUrl} → wpStatus=${newStatus} dbStatus=${pr.postStatus}`);

          // 変更がある場合のみ UPDATE
          const statusChanged = newStatus !== pr.postStatus;
          const dateChanged   = newDate?.toISOString() !== pr.wpPublishedAt?.toISOString();

          if (statusChanged || dateChanged) {
            await prisma.postResult.update({
              where: { id: pr.id },
              data: {
                postStatus:    newStatus,
                wpPublishedAt: newDate,
              },
            });
            updated++;
          } else {
            skipped++;
          }
        } catch (e) {
          debugLog.push(`[ERROR] wpPostId=${pr.wpPostId} ${e.message}`);
          errors++;
        }
      }
    }

    return NextResponse.json({ success: true, updated, skipped, errors, debugLog });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
