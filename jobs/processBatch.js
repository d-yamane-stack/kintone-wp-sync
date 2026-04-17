'use strict';

const { processRecord } = require('./processRecord');
const { sleep } = require('../lib/http');

/**
 * @param {object[]} records - Kintoneレコード配列
 * @param {object} siteConfig - sites/siteConfigs.js の1サイト設定
 */
async function processBatch(records, siteConfig) {
  // タクソノミーキャッシュをバッチ内で共有するための context
  const context = { siteConfig: siteConfig };
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

  return results;
}

function printBatchSummary(results) {
  console.log('\n==========================================');
  console.log('処理結果');
  const succeeded = results.filter(function(r) { return r.status === 'success'; });
  const failed = results.filter(function(r) { return r.status === 'error'; });
  console.log('成功: ' + succeeded.length + '件 / 失敗: ' + failed.length + '件');
  succeeded.forEach(function(r) {
    console.log('  完了: ' + r.result.expandedText.pageTitle);
    console.log('  URL: ' + r.result.wpResult.editUrl);
  });
  console.log('\n完了！スプレッドシートをご確認ください。');
}

module.exports = { processBatch, printBatchSummary };
