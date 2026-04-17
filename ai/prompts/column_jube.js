'use strict';

/**
 * ハウジング重兵衛向けコラム生成プロンプト
 * promptKey: 'column_jube'
 *
 * @param {object} params
 * @param {string} params.keyword   - メインキーワード（例: "キッチンリフォーム 費用"）
 * @param {string} params.audience  - 想定読者（例: "40代主婦、キッチンリフォームを検討中"）
 * @param {string} params.tone      - 文体（例: "親しみやすく丁寧"）
 * @param {string} [params.cta]     - CTA文言（例: "無料相談はこちら"）
 */
function buildPrompt(params) {
  var keyword  = params.keyword  || '';
  var audience = params.audience || '一般のお客様';
  var tone     = params.tone     || '親しみやすく丁寧';
  var cta      = params.cta      || '無料相談はこちら';

  return 'あなたはリフォーム会社「ハウジング重兵衛」のウェブサイト向けコンテンツライターです。\n' +
    '以下の条件でSEOを意識したコラム記事を作成してください。\n\n' +
    '【メインキーワード】' + keyword + '\n' +
    '【想定読者】' + audience + '\n' +
    '【文体・トーン】' + tone + '\n' +
    '【CTA文言】' + cta + '\n\n' +
    '以下のJSON形式のみで返答してください：\n' +
    '{\n' +
    '  "pageTitle": "SEOを意識した記事タイトル（30〜50文字）",\n' +
    '  "metaDescription": "メタディスクリプション（120文字前後）",\n' +
    '  "headings": [\n' +
    '    { "level": 2, "text": "見出しテキスト", "body": "その見出し下の本文（300〜500文字）" }\n' +
    '  ],\n' +
    '  "ctaSection": "記事末尾のCTA文章（100文字前後）"\n' +
    '}\n\n' +
    '要件:\n' +
    '- h2見出しを4〜6個作成すること\n' +
    '- 各見出し下の本文は自然な口語体で書くこと\n' +
    '- キーワードを本文中に自然に散りばめること\n' +
    '- 地域密着（千葉・茨城エリア）を意識した内容にすること';
}

module.exports = { buildPrompt };
