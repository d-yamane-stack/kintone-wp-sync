'use strict';

require('dotenv').config();

const { validateEnv, parseLimit, parseSiteId, askQuestion } = require('./cli/parseArgs');
const { getSiteConfig } = require('./sites/siteConfigs');
const { getKintoneRecords } = require('./sources/kintone');
const { extractRecordData } = require('./transformers/extractRecord');
const { processBatch, printBatchSummary } = require('./jobs/processBatch');

async function main() {
  console.log('\nKINTONE → WordPress 自動連携スクリプト');
  console.log('==========================================\n');

  validateEnv();

  const siteId = parseSiteId();
  const siteConfig = getSiteConfig(siteId); // 不明なIDは例外をスロー
  console.log('対象サイト: ' + siteConfig.siteName + ' [' + siteId + ']');
  console.log('投稿先: ' + siteConfig.wordpress.baseUrl);

  const limit = parseLimit();
  console.log('KINTONEから最新' + limit + '件を取得中...');
  const records = await getKintoneRecords(limit);

  if (records.length === 0) {
    console.log('処理対象のレコードがありません。');
    process.exit(0);
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
  console.log('\n処理内容:');
  console.log('  1. 画像クレンジング（1200pxリサイズ＋明るさ補正）');
  console.log('  2. Claude APIでテキスト推敲・拡張');
  console.log('  3. WordPressに下書き投稿 → ' + siteConfig.wordpress.baseUrl);
  console.log('  4. スプレッドシートに修正前後テキスト＋URLを記録');

  const answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
  if (answer.toLowerCase() !== 'y') {
    console.log('\nキャンセルしました。');
    process.exit(0);
  }

  console.log('\n処理開始...\n');

  const results = await processBatch(records, siteConfig);
  printBatchSummary(results);
}

main().catch(function(err) {
  console.error('致命的エラー:', err);
  process.exit(1);
});
