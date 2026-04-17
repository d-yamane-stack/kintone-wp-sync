'use strict';

const { CONFIG } = require('../config');
const { httpRequest } = require('../lib/http');
const { appendColumnToSheet } = require('../logs/logger');

/**
 * コラム生成パイプライン
 *
 * @param {object} params
 * @param {string} params.keyword
 * @param {string} params.audience
 * @param {string} params.tone
 * @param {string} [params.cta]
 * @param {object} siteConfig - sites/siteConfigs.js の columnConfig を含むサイト設定
 */
async function runColumnPipeline(params, siteConfig) {
  console.log('\nコラム生成開始');
  console.log('  キーワード: ' + params.keyword);
  console.log('  想定読者: ' + params.audience);

  // --- プロンプト選択 ---
  const promptKey = (siteConfig.columnPromptKey) || 'column_jube';
  const { buildPrompt } = require('../ai/prompts/' + promptKey);
  const prompt = buildPrompt(params);

  // --- Claude API でコラム生成 ---
  console.log('  Claude APIでコラム生成中...');
  const generated = await generateColumnWithClaude(prompt);
  console.log('  タイトル: ' + generated.pageTitle);

  // --- WordPress投稿データ組み立て ---
  const colConfig = siteConfig.columnConfig;
  const postType = (colConfig && colConfig.postType) || 'post';
  const status   = (colConfig && colConfig.defaultStatus) || 'draft';

  // headings → HTML本文に変換
  const content = buildHtmlContent(generated.headings);

  const postData = {
    title: generated.pageTitle,
    content: content,
    status: status,
    excerpt: generated.metaDescription || '',
  };

  // カテゴリータクソノミーが設定されていれば付与
  if (colConfig && colConfig.categoryIds && colConfig.categoryIds.length > 0) {
    postData.categories = colConfig.categoryIds;
  }

  // --- WordPress投稿 ---
  console.log('  WordPressに下書き投稿中...');
  const wpResult = await postColumnToWordPress(postData, postType, siteConfig);
  console.log('  下書き作成完了: ' + wpResult.editUrl);

  // --- Sheets記録 ---
  console.log('  スプレッドシートに記録中...');
  await appendColumnToSheet(params, generated, wpResult, siteConfig);
  console.log('  スプレッドシート記録完了');

  return { params, generated, wpResult };
}

// --- helpers ---

async function generateColumnWithClaude(prompt) {
  const { CONFIG: cfg } = require('../config');
  const response = await httpRequest({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': cfg.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
  }, {
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(function(c) { return c.type === 'text'; });
  if (!textContent) throw new Error('Claude APIからテキストが返されませんでした');
  try {
    return JSON.parse(textContent.text.replace(/```json|```/g, '').trim());
  } catch (e) {
    throw new Error('Claude APIレスポンスのパース失敗: ' + textContent.text.substring(0, 200));
  }
}

/**
 * headings 配列 → WP用HTML本文
 */
function buildHtmlContent(headings) {
  if (!Array.isArray(headings)) return '';
  return headings.map(function(h) {
    var level = h.level || 2;
    var tag = 'h' + level;
    return '<' + tag + '>' + escapeHtml(h.text) + '</' + tag + '>\n' +
      '<p>' + escapeHtml(h.body).replace(/\n/g, '</p>\n<p>') + '</p>';
  }).join('\n\n');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function postColumnToWordPress(postData, postType, siteConfig) {
  const { httpRequest: req } = require('../lib/http');
  const auth = 'Basic ' + Buffer.from(
    siteConfig.wordpress.username + ':' + siteConfig.wordpress.appPassword
  ).toString('base64');

  const response = await req({
    url: siteConfig.wordpress.restBase + postType,
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
  }, JSON.stringify(postData));

  if (!response || !response.id) {
    throw new Error('WP投稿エラー: ' + JSON.stringify(response).substring(0, 200));
  }

  const postId = response.id;
  return {
    postId: postId,
    draftUrl: siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
    editUrl: siteConfig.wordpress.baseUrl + '/wp-admin/post.php?post=' + postId + '&action=edit',
  };
}

module.exports = { runColumnPipeline };
