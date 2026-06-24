'use strict';

/**
 * Google Search Console API リフレッシュトークン取得スクリプト
 * 使い方: node scripts/get-gsc-token.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const http       = require('http');

// 認証情報は .env から読み込む（リポジトリにシークレットを残さない）
const CLIENT_ID     = process.env.GSC_CLIENT_ID;
const CLIENT_SECRET = process.env.GSC_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GSC_REDIRECT_URI || 'http://localhost:8080';
const PORT          = 8080;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('環境変数 GSC_CLIENT_ID と GSC_CLIENT_SECRET を .env に設定してください（Google Cloud Console の OAuth クライアント情報）。');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope:       ['https://www.googleapis.com/auth/webmasters.readonly'],
  prompt:      'consent',
});

console.log('\n========================================');
console.log('以下のURLをブラウザで開いてください:');
console.log('========================================\n');
console.log(authUrl);
console.log('\n========================================');
console.log('ブラウザでGoogleログイン → 許可 → 自動取得します');
console.log('========================================\n');

// ローカルサーバーでコードを受け取る
const server = http.createServer(async function(req, res) {
  const url  = new URL(req.url, 'http://localhost:' + PORT);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('コードが見つかりません');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h2>✅ 認証成功！ターミナルに戻ってください。</h2>');
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n========================================');
    console.log('✅ 成功！以下を .env に追加してください:');
    console.log('========================================\n');
    console.log('GSC_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\n(GSC_CLIENT_ID / GSC_CLIENT_SECRET は環境変数から読み込み済み)');
    console.log('\n========================================\n');
  } catch (err) {
    console.error('❌ エラー:', err.message);
  }
});

server.listen(PORT, function() {
  console.log('ポート ' + PORT + ' で待機中...\n');
});
