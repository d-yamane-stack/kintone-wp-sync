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
  const rawPostType = (colConfig && colConfig.postType) || 'post';
  // WordPress REST API は標準投稿タイプを複数形で受け付ける（post→posts, page→pages）
  const postType = rawPostType === 'post' ? 'posts' : rawPostType === 'page' ? 'pages' : rawPostType;
  const status   = (colConfig && colConfig.defaultStatus) || 'draft';

  // generated → HTML本文に変換
  const content = buildHtmlContent(generated);

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

  // --- Sheets記録（credentials.json 未設定時はスキップ）---
  try {
    console.log('  スプレッドシートに記録中...');
    await appendColumnToSheet(params, generated, wpResult, siteConfig);
    console.log('  スプレッドシート記録完了');
  } catch (e) {
    console.warn('  スプレッドシート記録スキップ: ' + e.message);
  }

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
 * generated オブジェクト → Gutenberg ブロック形式の WP 本文
 */
function buildHtmlContent(generated) {
  var parts = [];

  // 導入文（wp:paragraph）
  if (Array.isArray(generated.introLines)) {
    generated.introLines.forEach(function(line) {
      if (line) {
        parts.push(
          '<!-- wp:paragraph -->\n' +
          '<p>' + escapeHtml(line) + '</p>\n' +
          '<!-- /wp:paragraph -->'
        );
      }
    });
  }

  // スピーチバルーン（Custom HTML ブロックで挿入）
  if (generated.speechBalloon) {
    var balloonHtml = generated.speechBalloon
      .split('\n')
      .map(function(l) { return escapeHtml(l); })
      .join('<br>');
    parts.push(
      '<!-- wp:html -->\n' +
      '<div class="wp-block-liquid-speech-balloon liquid-speech-balloon-wrap liquid-speech-balloon-00">' +
      '<div class="liquid-speech-balloon-content liquid-speech-balloon-left">' +
      '<div class="liquid-speech-balloon-arrow"></div>' +
      '<div class="liquid-speech-balloon-text"><p>' + balloonHtml + '</p></div>' +
      '</div></div>\n' +
      '<!-- /wp:html -->'
    );
  }

  // 本文セクション
  if (Array.isArray(generated.headings)) {
    generated.headings.forEach(function(h) {
      var level    = h.level || 2;
      var cssClass = h.cssClass || 'is-style-heading';

      // H2ブロック
      parts.push(
        '<!-- wp:heading {"level":' + level + ',"className":"' + cssClass + '"} -->\n' +
        '<h' + level + ' class="wp-block-heading ' + cssClass + '">' + escapeHtml(h.text) + '</h' + level + '>\n' +
        '<!-- /wp:heading -->'
      );

      // 本文段落
      if (h.body) {
        h.body.split(/\n\n+/).forEach(function(para) {
          var trimmed = para.trim();
          if (trimmed) {
            parts.push(
              '<!-- wp:paragraph -->\n' +
              '<p>' + escapeHtml(trimmed) + '</p>\n' +
              '<!-- /wp:paragraph -->'
            );
          }
        });
      }

      // 箇条書き（wp:list）
      if (Array.isArray(h.listItems) && h.listItems.length > 0) {
        var listClass = h.listClass || 'is-style-ul-style1';
        var items = h.listItems.map(function(item) {
          return '<!-- wp:list-item --><li>' + escapeHtml(item) + '</li><!-- /wp:list-item -->';
        }).join('\n');
        parts.push(
          '<!-- wp:list {"className":"' + listClass + '"} -->\n' +
          '<ul class="wp-block-list ' + listClass + '">\n' + items + '\n</ul>\n' +
          '<!-- /wp:list -->'
        );
      }
    });
  }

  // まとめ（クラスなしH2）
  if (generated.summary) {
    parts.push(
      '<!-- wp:heading {"level":2} -->\n' +
      '<h2 class="wp-block-heading">まとめ</h2>\n' +
      '<!-- /wp:heading -->'
    );
    var summaryText = generated.summary.text || generated.summary;
    if (summaryText) {
      summaryText.split(/\n\n+/).forEach(function(para) {
        var trimmed = para.trim();
        if (trimmed) {
          parts.push(
            '<!-- wp:paragraph -->\n' +
            '<p>' + escapeHtml(trimmed) + '</p>\n' +
            '<!-- /wp:paragraph -->'
          );
        }
      });
    }
  }

  // CTA
  if (generated.ctaSection) {
    parts.push(
      '<!-- wp:paragraph -->\n' +
      '<p>' + escapeHtml(generated.ctaSection) + '</p>\n' +
      '<!-- /wp:paragraph -->'
    );
  }

  return parts.join('\n\n');
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

  const postId    = response.id;
  const adminBase = siteConfig.wordpress.adminBase || (siteConfig.wordpress.baseUrl + '/wp-admin/');
  return {
    postId:   postId,
    draftUrl: siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
    editUrl:  adminBase + 'post.php?post=' + postId + '&action=edit',
  };
}

module.exports = { runColumnPipeline };
