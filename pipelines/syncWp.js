'use strict';

const { getPrismaClient } = require('../db/client');
const { getSiteConfig }   = require('../sites/siteConfigs');

/**
 * DB上の全ジョブのWordPressステータスを同期する。
 * ローカルIPから呼ばれるため、XSERVERの海外IPブロックに引っかからない。
 */
async function runSyncWpPipeline() {
  const db = getPrismaClient();

  const jobs = await db.contentJob.findMany({
    where:   { deletedAt: null },
    include: {
      contentItems: {
        include: { postResult: true },
        where:   { postResult: { isNot: null } },
      },
    },
  });

  let updated       = 0;
  let skippedNoId   = 0;  // wpPostId が null → WP投稿未完了
  let skippedNoChange = 0; // ステータス変化なし
  let skippedCreds  = 0;  // credentials 未設定
  let errors        = 0;
  const errorDetails = [];

  for (const job of jobs) {
    let creds;
    try {
      const sc = getSiteConfig(job.siteId);
      creds = {
        wpBaseUrl:    sc.wordpress.baseUrl,
        wpUsername:   sc.wordpress.username,
        wpAppPassword: sc.wordpress.appPassword,
        wpPostType:   sc.wordpress.postType,
      };
    } catch (e) {
      console.warn('[SyncWP] siteConfig not found: siteId=' + job.siteId);
      skippedCreds++;
      continue;
    }

    if (!creds.wpBaseUrl || !creds.wpUsername || !creds.wpAppPassword) {
      console.warn('[SyncWP] credentials missing: siteId=' + job.siteId);
      skippedCreds++;
      continue;
    }

    const restBase = job.jobType === 'column' ? 'column' : creds.wpPostType;
    const baseUrl  = creds.wpBaseUrl.replace(/\/$/, '');
    const auth     = 'Basic ' + Buffer.from(creds.wpUsername + ':' + creds.wpAppPassword).toString('base64');

    for (const item of job.contentItems) {
      const pr = item.postResult;
      if (!pr || !pr.wpPostId) {
        console.log('[SyncWP] wpPostId未設定: jobId=' + job.id + ' title=' + item.generatedTitle);
        skippedNoId++;
        continue;
      }

      try {
        const wpUrl = baseUrl + '/wp-json/wp/v2/' + restBase + '/' + pr.wpPostId;
        const wpRes = await fetch(wpUrl, { headers: { 'Authorization': auth } });

        if (!wpRes.ok) {
          const errBody = await wpRes.text().catch(() => '');
          console.log('[SyncWP] HTTP ' + wpRes.status + ' ' + wpUrl + ' body=' + errBody.slice(0, 120));
          if (wpRes.status === 404 && pr.postStatus !== 'wp_deleted') {
            await db.postResult.update({
              where: { id: pr.id },
              data:  { postStatus: 'wp_deleted', wpPublishedAt: null },
            });
            updated++;
          } else {
            errorDetails.push('HTTP ' + wpRes.status + ' wpPostId=' + pr.wpPostId);
            errors++;
          }
          continue;
        }

        const wpData    = await wpRes.json();
        const newStatus = wpData.status || pr.postStatus;
        const newDate   = (newStatus === 'publish' || newStatus === 'future')
          ? (wpData.date ? new Date(wpData.date) : null)
          : null;

        const statusChanged = newStatus !== pr.postStatus;
        const dateChanged   = (newDate ? newDate.toISOString() : null) !==
                              (pr.wpPublishedAt ? pr.wpPublishedAt.toISOString() : null);

        if (statusChanged || dateChanged) {
          await db.postResult.update({
            where: { id: pr.id },
            data:  { postStatus: newStatus, wpPublishedAt: newDate },
          });
          updated++;
          console.log('[SyncWP] 更新: wpPostId=' + pr.wpPostId +
            ' ' + pr.postStatus + ' → ' + newStatus);
        } else {
          skippedNoChange++;
        }
      } catch (e) {
        console.error('[SyncWP] ERROR wpPostId=' + pr.wpPostId + ' ' + e.message);
        errorDetails.push(e.message.slice(0, 80));
        errors++;
      }
    }
  }

  const skipped = skippedNoId + skippedNoChange + skippedCreds;
  console.log('[SyncWP] 完了 updated=' + updated +
    ' skippedNoId=' + skippedNoId +
    ' skippedNoChange=' + skippedNoChange +
    ' skippedCreds=' + skippedCreds +
    ' errors=' + errors);
  return { updated, skipped, skippedNoId, skippedNoChange, skippedCreds, errors, errorDetails };
}

module.exports = { runSyncWpPipeline };
