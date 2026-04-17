'use strict';

const readline = require('readline');

// WordPress認証はサイト別 (siteConfigs.js) で管理するため除外
const REQUIRED_ENV = [
  'KINTONE_API_TOKEN',
  'ANTHROPIC_API_KEY',
  'GOOGLE_SHEET_ID',
];

function validateEnv() {
  for (var i = 0; i < REQUIRED_ENV.length; i++) {
    var key = REQUIRED_ENV[i];
    if (!process.env[key] || process.env[key].indexOf('ここに') !== -1) {
      console.error('環境変数 ' + key + ' が未設定です。');
      process.exit(1);
    }
  }
}

function parseLimit() {
  // --site= フラグを除いた最初の数値引数を件数として扱う
  for (var i = 2; i < process.argv.length; i++) {
    if (!process.argv[i].startsWith('--')) {
      return parseInt(process.argv[i], 10) || 3;
    }
  }
  return 3;
}

/**
 * CLIから --site=<siteId> を取得する。
 * 未指定の場合は環境変数 SITE_ID、どちらもなければ 'jube' をデフォルトとする。
 *
 * 使用例:
 *   node index.js 5 --site=jube
 *   node index.js --site=another_site
 */
function parseSiteId() {
  for (var i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--site=')) {
      return process.argv[i].split('=')[1];
    }
  }
  return process.env.SITE_ID || 'jube';
}

/**
 * --pipeline=<name> を取得する。
 * 指定なし → 'case_study'（既存動作を維持）
 *
 * 使用例:
 *   node index.js --pipeline=case_study --site=jube 5
 *   node index.js --pipeline=column --site=jube --keyword="キッチンリフォーム 費用"
 */
function parsePipeline() {
  for (var i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith('--pipeline=')) {
      return process.argv[i].split('=')[1];
    }
  }
  return 'case_study';
}

/**
 * コラム生成パイプライン用パラメータをまとめて取得する。
 * --keyword="..." --audience="..." --tone="..." --cta="..."
 */
function parseColumnParams() {
  var params = {
    keyword:  getFlagValue('--keyword')  || '',
    audience: getFlagValue('--audience') || '一般のお客様',
    tone:     getFlagValue('--tone')     || '親しみやすく丁寧',
    cta:      getFlagValue('--cta')      || '無料相談はこちら',
  };
  return params;
}

function getFlagValue(flag) {
  var prefix = flag + '=';
  for (var i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith(prefix)) {
      return process.argv[i].slice(prefix.length).replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question(question, function(answer) { rl.close(); resolve(answer.trim()); });
  });
}

module.exports = { validateEnv, parseLimit, parseSiteId, parsePipeline, parseColumnParams, askQuestion };
