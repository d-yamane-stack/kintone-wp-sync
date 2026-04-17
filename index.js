'use strict';

require('dotenv').config();

const { validateEnv, parseLimit, parseSiteId, parsePipeline, parseColumnParams, askQuestion } = require('./cli/parseArgs');
const { getSiteConfig } = require('./sites/siteConfigs');

async function main() {
  console.log('\nKINTONE → WordPress 自動連携スクリプト');
  console.log('==========================================\n');

  validateEnv();

  const siteId   = parseSiteId();
  const pipeline = parsePipeline();
  const siteConfig = getSiteConfig(siteId);

  console.log('対象サイト: ' + siteConfig.siteName + ' [' + siteId + ']');
  console.log('パイプライン: ' + pipeline);
  console.log('投稿先: ' + siteConfig.wordpress.baseUrl + '\n');

  if (pipeline === 'column') {
    await runColumnPipeline(siteConfig);
  } else {
    await runCaseStudyPipeline(siteConfig);
  }
}

async function runCaseStudyPipeline(siteConfig) {
  const { runCaseStudyPipeline: run } = require('./pipelines/caseStudy');
  const limit = parseLimit();
  await run({ limit: limit }, siteConfig);
}

async function runColumnPipeline(siteConfig) {
  const { runColumnPipeline: run } = require('./pipelines/column');
  const params = parseColumnParams();

  if (!params.keyword) {
    console.error('エラー: --keyword が必要です。');
    console.error('例: node index.js --pipeline=column --keyword="キッチンリフォーム 費用" --site=jube');
    process.exit(1);
  }

  console.log('コラム生成パラメータ:');
  console.log('  キーワード: ' + params.keyword);
  console.log('  想定読者: ' + params.audience);
  console.log('  文体: ' + params.tone);
  console.log('  CTA: ' + params.cta);

  const answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
  if (answer.toLowerCase() !== 'y') {
    console.log('\nキャンセルしました。');
    process.exit(0);
  }

  await run(params, siteConfig);
}

main().catch(function(err) {
  console.error('致命的エラー:', err);
  process.exit(1);
});
