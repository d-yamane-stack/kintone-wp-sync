'use strict';

require('dotenv').config();

const { Worker } = require('bullmq');
const { QUEUE_NAME, getContentJobQueue } = require('./queue/index');
const { getRedisConnection } = require('./queue/connection');
const { getSiteConfig } = require('./sites/siteConfigs');
const { runCaseStudyPipeline } = require('./pipelines/caseStudy');
const { runColumnPipeline } = require('./pipelines/column');
const { finishJob } = require('./db/repositories/jobRepo');
const { disconnectPrisma } = require('./db/client');

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);

console.log('[Worker] 起動中 (concurrency=' + CONCURRENCY + ')');

// -------------------------------------------------------
// ジョブ処理ハンドラ
// -------------------------------------------------------
async function handleJob(job) {
  const data = job.data;
  console.log('\n[Worker] ジョブ受信: id=' + job.id + ' type=' + data.type + ' site=' + data.siteId);

  const siteConfig = getSiteConfig(data.siteId);

  try {
    if (data.type === 'case_study') {
      await runCaseStudyPipeline(
        { limit: data.limit || 3, yes: true }, // yes: true でインタラクティブ確認をスキップ
        siteConfig
      );

    } else if (data.type === 'column') {
      await runColumnPipeline({
        keyword:  data.keyword,
        audience: data.audience || '一般のお客様',
        tone:     data.tone     || '親しみやすく丁寧',
        cta:      data.cta      || '無料相談はこちら',
      }, siteConfig);

    } else {
      throw new Error('不明なジョブタイプ: ' + data.type);
    }

    // DB: 完了
    if (data.dbJobId) {
      await finishJob(data.dbJobId, 'done').catch(function(e) {
        console.warn('[Worker] DB完了記録失敗: ' + e.message);
      });
    }

    console.log('[Worker] ジョブ完了: id=' + job.id);

  } catch (err) {
    console.error('[Worker] ジョブエラー: id=' + job.id + ' ' + err.message);

    // DB: エラー記録
    if (data.dbJobId) {
      await finishJob(data.dbJobId, 'error', err.message).catch(function() {});
    }

    throw err; // BullMQ にエラーを伝えてリトライ制御させる
  }
}

// -------------------------------------------------------
// Worker 起動
// -------------------------------------------------------
const worker = new Worker(QUEUE_NAME, handleJob, {
  connection:  getRedisConnection(),
  concurrency: CONCURRENCY,
});

worker.on('completed', function(job) {
  console.log('[Worker] 完了: ' + job.id);
});

worker.on('failed', function(job, err) {
  const attempts = job ? job.attemptsMade : '?';
  console.error('[Worker] 失敗 (試行' + attempts + '回目): ' + (job && job.id) + ' / ' + err.message);
});

worker.on('error', function(err) {
  console.error('[Worker] Workerエラー: ' + err.message);
});

console.log('[Worker] 起動完了 — キュー待機中');

// -------------------------------------------------------
// グレースフルシャットダウン
// -------------------------------------------------------
async function shutdown() {
  console.log('[Worker] シャットダウン中...');
  await worker.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
