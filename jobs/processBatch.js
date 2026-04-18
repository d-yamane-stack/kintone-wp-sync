'use strict';

const { processRecord } = require('./processRecord');
const { sleep } = require('../lib/http');
const { createJob, finishJob } = require('../db/repositories/jobRepo');

/**
 * @param {object[]} records   - Kintoneレコード配列
 * @param {object}  siteConfig - sites/siteConfigs.js の1サイト設定
 * @param {object}  [opts]
 * @param {object}  [opts.jobMeta] - ジョブ固有パラメータ（limit等）をDBに保存
 */
async function processBatch(records, siteConfig, opts) {
  opts = opts || {};

  // ---- DB: ジョブ開始を記録（既存jobIdがある場合はスキップ）----
  var jobId = opts.existingJobId || null;
  var job   = null;
  if (!jobId) {
    try {
      job = await createJob({
        siteId:  siteConfig.siteId,
        jobType: 'case_study',
        meta:    opts.jobMeta || { limit: records.length },
      });
      jobId = job.id;
      console.log('  [DB] ジョブ開始: ' + jobId);
    } catch (dbErr) {
      console.warn('  [DB警告] ジョブ開始記録に失敗しました: ' + dbErr.message);
    }
  } else {
    console.log('  [DB] 既存ジョブを使用: ' + jobId);
  }

  // タクソノミーキャッシュをバッチ内で共有するための context
  const context = {
    siteConfig: siteConfig,
    jobId:      jobId,
  };
  const results = [];

  for (var j = 0; j < records.length; j++) {
    try {
      const result = await processRecord(records[j], context);
      results.push({ status: 'success', result: result });
    } catch (err) {
      console.error('エラー: ' + err.message);
      results.push({ status: 'error', error: err.message });
    }
    if (j < records.length - 1) await sleep(2000);
  }

  // ---- DB: ジョブ完了を記録（existingJobIdの場合はworker.jsが担当）----
  if (job && !opts.existingJobId) {
    const hasError = results.some(function(r) { return r.status === 'error'; });
    const finalStatus = hasError ? 'done_with_errors' : 'done';
    try {
      await finishJob(job.id, finalStatus);
    } catch (dbErr) {
      console.warn('  [DB警告] ジョブ完了記録に失敗しました: ' + dbErr.message);
    }
  }

  return results;
}

function printBatchSummary(results) {
  console.log('\n==========================================');
  console.log('処理結果');
  const succeeded = results.filter(function(r) { return r.status === 'success'; });
  const failed    = results.filter(function(r) { return r.status === 'error'; });
  console.log('成功: ' + succeeded.length + '件 / 失敗: ' + failed.length + '件');
  succeeded.forEach(function(r) {
    console.log('  完了: ' + r.result.expandedText.pageTitle);
    console.log('  URL: ' + r.result.wpResult.editUrl);
  });
  if (failed.length > 0) {
    console.log('失敗レコード:');
    failed.forEach(function(r) { console.log('  ' + r.error); });
  }
  console.log('\n完了！DBおよびスプレッドシートをご確認ください。');
}

module.exports = { processBatch, printBatchSummary };
