'use strict';

require('dotenv').config({ override: true });

const { getSiteConfig }          = require('./sites/siteConfigs');
const { runCaseStudyPipeline }   = require('./pipelines/caseStudy');
const { runColumnPipeline }      = require('./pipelines/column');
const { runSyncWpPipeline }      = require('./pipelines/syncWp');
const { runSeoRankPipeline }     = require('./pipelines/seoRank');
const { pickPendingJob, finishJob, createJob } = require('./db/repositories/jobRepo');
const { disconnectPrisma }       = require('./db/client');
const cron                       = require('node-cron');

// ポーリング間隔（ms）。Redis不要。
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

let isProcessing  = false;
let isShuttingDown = false;
let timer         = null;

console.log('[Worker] 起動完了 — Supabaseポーリング間隔: ' + POLL_INTERVAL + 'ms');

// -------------------------------------------------------
// ジョブ処理ハンドラ
// -------------------------------------------------------
async function processNextJob() {
  if (isProcessing || isShuttingDown) return;
  isProcessing = true;

  try {
    const job = await pickPendingJob();
    if (!job) return; // pending なし

    const meta = job.meta || {};
    console.log('\n[Worker] ジョブ受信: id=' + job.id + ' type=' + job.jobType + ' site=' + job.siteId);

    try {
      if (job.jobType === 'case_study') {
        const siteConfig = getSiteConfig(job.siteId);
        await runCaseStudyPipeline(
          { limit: meta.limit || 3, recordIds: meta.recordIds || null, yes: true },
          siteConfig,
          job.id
        );

      } else if (job.jobType === 'column') {
        const siteConfig = getSiteConfig(job.siteId);
        await runColumnPipeline({
          keyword:     meta.keyword,
          directTitle: meta.directTitle || false,
          audience:    meta.audience || '一般のお客様',
          tone:        meta.tone     || '親しみやすく丁寧',
          cta:         meta.cta      || '無料相談はこちら',
        }, siteConfig, job.id);

      } else if (job.jobType === 'sync_wp') {
        await runSyncWpPipeline();

      } else if (job.jobType === 'seo_check') {
        await runSeoRankPipeline({
          siteId:     meta.siteId     || null,
          keywordIds: meta.keywordIds || null,
          sendReport: meta.sendReport !== false,
          trigger:    meta.trigger    || 'manual',
        }, job.id);

      } else {
        throw new Error('不明なジョブタイプ: ' + job.jobType);
      }

      await finishJob(job.id, 'done');
      console.log('[Worker] ジョブ完了: id=' + job.id);

    } catch (err) {
      console.error('[Worker] ジョブエラー: id=' + job.id + ' ' + err.message);
      await finishJob(job.id, 'error', err.message).catch(function() {});
    }

  } catch (err) {
    console.error('[Worker] ポーリングエラー:', err.message);
  } finally {
    isProcessing = false;
  }
}

// ポーリング開始（起動直後も即チェック）
processNextJob();
timer = setInterval(processNextJob, POLL_INTERVAL);

// -------------------------------------------------------
// SEO順位チェック 月2回自動実行（毎月1日・15日 09:00）
// -------------------------------------------------------
cron.schedule('0 9 1,15 * *', async function() {
  console.log('[Worker][Cron] SEO月次順位チェック 開始');
  try {
    await createJob({
      siteId:   'jube',
      siteName: 'SEO-AUTO',
      jobType:  'seo_check',
      meta: { siteId: null, keywordIds: null, sendReport: true, trigger: 'auto' },
    });
    console.log('[Worker][Cron] SEOジョブをキューに登録しました');
  } catch (err) {
    console.error('[Worker][Cron] SEOジョブ登録エラー: ' + err.message);
  }
}, { timezone: 'Asia/Tokyo' });

// -------------------------------------------------------
// グレースフルシャットダウン
// -------------------------------------------------------
async function shutdown() {
  console.log('[Worker] シャットダウン中...');
  isShuttingDown = true;
  if (timer) clearInterval(timer);
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// -------------------------------------------------------
// グローバルエラーハンドラ
// -------------------------------------------------------
process.on('unhandledRejection', function(reason) {
  console.error('[Worker] UnhandledRejection:', reason);
});
process.on('uncaughtException', function(err) {
  console.error('[Worker] UncaughtException:', err);
  process.exit(1);
});
