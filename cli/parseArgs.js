'use strict';

const readline = require('readline');

const REQUIRED_ENV = [
  'KINTONE_API_TOKEN',
  'ANTHROPIC_API_KEY',
  'WP_USERNAME',
  'WP_APP_PASSWORD',
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
  return parseInt(process.argv[2] || '3', 10);
}

function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question(question, function(answer) { rl.close(); resolve(answer.trim()); });
  });
}

module.exports = { validateEnv, parseLimit, askQuestion };
