import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// siteId から WP接続情報を環境変数で解決する
function getSiteCredentials(siteId) {
  if (siteId === 'nurube') {
    return {
      wpBaseUrl:     process.env.NURUBE_WP_BASE_URL,
      wpUsername:    process.env.NURUBE_WP_USERNAME,
      wpAppPassword: process.env.NURUBE_WP_APP_PASSWORD,
      wpPostType:    'properties',
    };
  }
  // jube（デフォルト）
  return {
    wpBaseUrl:     process.env.JUBE_WP_BASE_URL     || process.env.WP_BASE_URL,
    wpUsername:    process.env.JUBE_WP_USERNAME      || process.env.WP_USERNAME,
    wpAppPassword: process.env.JUBE_WP_APP_PASSWORD  || process.env.WP_APP_PASSWORD,
    wpPostType:    'example',
  };
}

// GET /api/jobs/sync-wp — 環境変数の設定状況を診断（認証情報は隠す）
export async function GET() {
  const mask = (v) => v ? v.slice(0, 3) + '***' : '(未設定)';
  return NextResponse.json({
    jube: {
      wpBaseUrl:     process.env.JUBE_WP_BASE_URL     || process.env.WP_BASE_URL     || '(未設定)',
      wpUsername:    mask(process.env.JUBE_WP_USERNAME  || process.env.WP_USERNAME),
      wpAppPassword: mask(process.env.JUBE_WP_APP_PASSWORD || process.env.WP_APP_PASSWORD),
    },
    nurube: {
      wpBaseUrl:     process.env.NURUBE_WP_BASE_URL    || '(未設定)',
      wpUsername:    mask(process.env.NURUBE_WP_USERNAME),
      wpAppPassword: mask(process.env.NURUBE_WP_APP_PASSWORD),
    },
  });
}

// POST /api/jobs/sync-wp — 表示中ジョブのWPステータスを一括同期
export async function POST() {
  try {
    const jobs = await prisma.contentJob.findMany({
      where: { deletedAt: null },
      include: {
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
      const creds = getSiteCredentials(job.siteId);

      if (!creds.wpBaseUrl || !creds.wpUsername || !creds.wpAppPassword) {
        debugLog.push(`[SKIP] siteId=${job.siteId} credentials missing`);
        skipped++;
        continue;
      }

      const restBase = job.jobType === 'column' ? 'column' : creds.wpPostType;
      const baseUrl  = creds.wpBaseUrl.replace(/\/$/, '');
      // WP Application Password: スペースは除去しない（WPが認識する形式のまま使う）
      const auth     = 'Basic ' + Buffer.from(`${creds.wpUsername}:${creds.wpAppPassword}`).toString('base64');
      debugLog.push(`[CREDS] siteId=${job.siteId} user=${creds.wpUsername} passLen=${creds.wpAppPassword.length} baseUrl=${baseUrl}`);

      for (const item of job.contentItems) {
        const pr = item.postResult;
        if (!pr || !pr.wpPostId) { skipped++; continue; }

        try {
          const wpUrl = `${baseUrl}/wp-json/wp/v2/${restBase}/${pr.wpPostId}`;
          const wpRes = await fetch(wpUrl, { headers: { 'Authorization': auth }, cache: 'no-store' });

          if (!wpRes.ok) {
            let errBody = '';
            try { errBody = await wpRes.text(); } catch(_) {}
            debugLog.push(`[HTTP ${wpRes.status}] ${wpUrl} body=${errBody.slice(0, 200)}`);
            if (wpRes.status === 404 && pr.postStatus !== 'wp_deleted') {
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

          const wpData    = await wpRes.json();
          const newStatus = wpData.status || pr.postStatus;
          const newDate   = (newStatus === 'publish' || newStatus === 'future')
            ? (wpData.date ? new Date(wpData.date) : null)
            : null;

          debugLog.push(`[OK] wpStatus=${newStatus} dbStatus=${pr.postStatus} url=${wpUrl}`);

          const statusChanged = newStatus !== pr.postStatus;
          const dateChanged   = newDate?.toISOString() !== pr.wpPublishedAt?.toISOString();

          if (statusChanged || dateChanged) {
            await prisma.postResult.update({
              where: { id: pr.id },
              data: { postStatus: newStatus, wpPublishedAt: newDate },
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
