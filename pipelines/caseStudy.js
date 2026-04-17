'use strict';

/**
 * 施工事例パイプライン
 * jobs/processBatch.js の薄いラッパー。
 * index.js から --pipeline=case_study で呼ばれる。
 */

const { getKintoneRecords } = require('../sources/kintone');
const { extractRecordData } = require('../transformers/extractRecord');
const { processBatch, printBatchSummary } = require('../jobs/processBatch');
const { askQuestion } = require('../cli/parseArgs');

async function runCaseStudyPipeline(options, siteConfig) {
  const limit = options.limit || 3;

  console.log('KINTONEから最新' + limit + '件を取得中...');
  const records = await getKintoneRecords(limit);

  if (records.length === 0) {
    console.log('処理対象のレコードがありません。');
    return;
  }

  console.log('\n処理対象レコード：');
  console.log('------------------------------------------------------------');
  records.forEach(function(record, i) {
    const d = extractRecordData(record);
    const trouble = (d.trouble || '').slice(0, 30);
    console.log((i + 1) + '. [ID:' + d.recordId + '] ' + (d.area || '施工箇所不明') + ' / ' + (d.location || '住所不明'));
    console.log('   悩み: ' + trouble + (trouble.length >= 30 ? '...' : ''));
    console.log('   写真: 施工前' + d.beforeImages.length + '枚 / 中' + d.duringImages.length + '枚 / 後' + d.afterImages.length + '枚');
  });
  console.log('------------------------------------------------------------');

  if (!options.yes) {
    const answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('\nキャンセルしました。');
      return;
    }
  }

  console.log('\n処理開始...\n');
  const results = await processBatch(records, siteConfig);
  printBatchSummary(results);
}

module.exports = { runCaseStudyPipeline };
