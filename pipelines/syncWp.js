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

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

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
      skipped++;
      continue;
    }

    if (!creds.wpBaseUrl || !creds.wpUsername || !creds.wpAppPassword) {
      console.warn('[SyncWP] credentials missing: siteId=' + job.siteId);
      skipped++;
      continue;
    }

    const restBase = job.jobType === 'column' ? 'column' : creds.wpPostType;
    const baseUrl  = creds.wpBaseUrl.replace(/\/$/, '');
    const auth     = 'Basic ' + Buffer.from(creds.wpUsername + ':' + creds.wpAppPassword).toString('base64');

    for (const item of job.contentItems) {
      const pr = item.postResult;
      if (!pr || !pr.wpPostId) { skipped++; continue; }

      try {
        const wpUrl = baseUrl + '/wp-json/wp/v2/' + restBase + '/' + pr.wpPostId;
        const wpRes = await fetch(wpUrl, { headers: { 'Authorization': auth } });

        if (!wpRes.ok) {
          console.log('[SyncWP] HTTP ' + wpRes.status + ' ' + wpUrl);
          if (wpRes.status === 404 && pr.postStatus !== 'wp_deleted') {
            await db.postResult.update({
              where: { id: pr.id },
              data:  { postStatus: 'wp_deleted', wpPublishedAt: null },
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
          skipped++;
        }
      } catch (e) {
        console.error('[SyncWP] ERROR wpPostId=' + pr.wpPostId + ' ' + e.message);
        errors++;
      }
    }
  }

  console.log('[SyncWP] 完了 updated=' + updated + ' skipped=' + skipped + ' errors=' + errors);
  return { updated, skipped, errors };
}

module.exports = { runSyncWpPipeline };
