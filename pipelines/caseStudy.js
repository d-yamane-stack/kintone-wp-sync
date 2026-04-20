'use strict';

/**
 * 施工事例パイプライン
 * siteId に応じてジュベ or ぬりべえ の処理を分岐する。
 */

const { getKintoneRecords, getKintoneRecordsByIds,
        getNurubeKintoneRecords, getNurubeKintoneRecordsByIds } = require('../sources/kintone');
const { extractRecordData }    = require('../transformers/extractRecord');
const { extractNurubeRecordData } = require('../transformers/extractNurubeRecord');
const { processBatch, printBatchSummary } = require('../jobs/processBatch');
const { processNurubeRecord }  = require('../jobs/processNurubeRecord');
const { askQuestion }          = require('../cli/parseArgs');
const { createJob, finishJob } = require('../db/repositories/jobRepo');
const { sleep }                = require('../lib/http');

async function runCaseStudyPipeline(options, siteConfig, jobId) {
  var siteId = siteConfig.siteId || 'jube';

  if (siteId === 'nurube') {
    return runNurubeCaseStudyPipeline(options, siteConfig, jobId);
  }

  // ---- ジュベ (既存フロー) ----
  var records;
  if (options.recordIds && options.recordIds.length > 0) {
    console.log('KINTONEから指定レコード ' + options.recordIds.join(', ') + ' を取得中...');
    records = await getKintoneRecordsByIds(options.recordIds);
  } else {
    var limit = options.limit || 3;
    console.log('KINTONEから最新' + limit + '件を取得中...');
    records = await getKintoneRecords(limit);
  }

  if (records.length === 0) {
    console.log('処理対象のレコードがありません。');
    return;
  }

  console.log('\n処理対象レコード：');
  console.log('------------------------------------------------------------');
  records.forEach(function(record, i) {
    var d = extractRecordData(record);
    var trouble = (d.trouble || '').slice(0, 30);
    console.log((i + 1) + '. [ID:' + d.recordId + '] ' + (d.area || '施工箇所不明') + ' / ' + (d.location || '住所不明'));
    console.log('   悩み: ' + trouble + (trouble.length >= 30 ? '...' : ''));
    console.log('   写真: 施工前' + d.beforeImages.length + '枚 / 中' + d.duringImages.length + '枚 / 後' + d.afterImages.length + '枚');
  });
  console.log('------------------------------------------------------------');

  if (!options.yes) {
    var answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('\nキャンセルしました。');
      return;
    }
  }

  console.log('\n処理開始...\n');
  var results = await processBatch(records, siteConfig, { existingJobId: jobId });
  printBatchSummary(results);
}

// ---------------------------------------------------------------------------
// ぬりべえ専用パイプライン
// ---------------------------------------------------------------------------

async function runNurubeCaseStudyPipeline(options, siteConfig, jobId) {
  var records;
  if (options.recordIds && options.recordIds.length > 0) {
    console.log('[ぬりべえ] KINTONEから指定レコード ' + options.recordIds.join(', ') + ' を取得中...');
    records = await getNurubeKintoneRecordsByIds(options.recordIds);
  } else {
    var limit = options.limit || 3;
    console.log('[ぬりべえ] KINTONEから最新' + limit + '件を取得中...');
    records = await getNurubeKintoneRecords(limit);
  }

  if (records.length === 0) {
    console.log('[ぬりべえ] 処理対象のレコードがありません。');
    return;
  }

  console.log('\n[ぬりべえ] 処理対象レコード：');
  console.log('------------------------------------------------------------');
  records.forEach(function(record, i) {
    var d = extractNurubeRecordData(record);
    console.log((i + 1) + '. [ID:' + d.recordId + '] ' + (d.area || '施工箇所不明') + ' / ' + (d.city || d.location || '住所不明'));
    console.log('   施工前' + d.beforeImages.length + '枚 / 施工中' + d.duringImages.length + '枚 / 施工後' + d.afterImages.length + '枚');
  });
  console.log('------------------------------------------------------------');

  if (!options.yes) {
    var answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('\nキャンセルしました。');
      return;
    }
  }

  console.log('\n[ぬりべえ] 処理開始...\n');

  // タクソノミーキャッシュをバッチ内で共有
  var context = {
    siteConfig: siteConfig,
    jobId:      jobId,
    fetchedTerms: { tantoChoices: null },
  };

  var succeeded = 0;
  var failed    = 0;
  var errors    = [];

  for (var i = 0; i < records.length; i++) {
    try {
      var result = await processNurubeRecord(records[i], context);
      console.log('  完了: ' + result.pageTitle + '\n  URL: ' + result.wpResult.editUrl);
      succeeded++;
    } catch (err) {
      console.error('  エラー: ' + err.message);
      errors.push(err.message);
      failed++;
    }
    if (i < records.length - 1) await sleep(2000);
  }

  console.log('\n==========================================');
  console.log('[ぬりべえ] 処理結果');
  console.log('成功: ' + succeeded + '件 / 失敗: ' + failed + '件');
  if (errors.length > 0) {
    console.log('失敗内容:');
    errors.forEach(function(e) { console.log('  ' + e); });
  }
  console.log('\n完了！DBをご確認ください。');
}

module.exports = { runCaseStudyPipeline };
