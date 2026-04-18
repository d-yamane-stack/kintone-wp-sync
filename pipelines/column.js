'use strict';

const { CONFIG } = require('../config');
const { httpRequest } = require('../lib/http');
const { appendColumnToSheet } = require('../logs/logger');
const { createItem, markGenerated, markPosted, markError } = require('../db/repositories/contentItemRepo');
const { createResult } = require('../db/repositories/postResultRepo');

/**
 * コラム生成パイプライン
 *
 * @param {object} params
 * @param {string} params.keyword
 * @param {string} params.audience
 * @param {string} params.tone
 * @param {string} [params.cta]
 * @param {object} siteConfig - sites/siteConfigs.js の columnConfig を含むサイト設定
 * @param {string} [jobId]    - DB の contentJob.id（未指定時はDB保存スキップ）
 */
async function runColumnPipeline(params, siteConfig, jobId) {
  console.log('\nコラム生成開始');
  console.log('  キーワード: ' + params.keyword);
  console.log('  想定読者: ' + params.audience);

  // --- DB: contentItem を pending で登録 ---
  var itemId = null;
  if (jobId) {
    try {
      const item = await createItem({
        jobId:      jobId,
        sourceType: 'manual',
        rawInput:   params,
      });
      itemId = item.id;
    } catch (e) {
      console.warn('  [DB警告] アイテム登録失敗: ' + e.message);
    }
  }

  // --- プロンプト選択 ---
  const promptKey = (siteConfig.columnPromptKey) || 'column_jube';
  const { buildPrompt } = require('../ai/prompts/' + promptKey);
  const prompt = buildPrompt(params);

  // --- Claude API でコラム生成 ---
  console.log('  Claude APIでコラム生成中...');
  var generated;
  try {
    generated = await generateColumnWithClaude(prompt);
  } catch (e) {
    if (itemId) await markError(itemId, e.message).catch(function() {});
    throw e;
  }
  console.log('  タイトル: ' + generated.pageTitle);

  // --- DB: generated に更新 ---
  if (itemId) {
    await markGenerated(itemId, generated).catch(function(e) {
      console.warn('  [DB警告] generated更新失敗: ' + e.message);
    });
  }

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
  var wpResult;
  try {
    wpResult = await postColumnToWordPress(postData, postType, siteConfig);
  } catch (e) {
    if (itemId) await markError(itemId, e.message).catch(function() {});
    throw e;
  }
  console.log('  下書き作成完了: ' + wpResult.editUrl);

  // --- DB: posted に更新 + postResult 登録 ---
  if (itemId) {
    await markPosted(itemId).catch(function(e) {
      console.warn('  [DB警告] posted更新失敗: ' + e.message);
    });
    await createResult({
      contentItemId: itemId,
      wpPostId:      wpResult.postId,
      wpUrl:         wpResult.draftUrl || wpResult.editUrl,
      wpEditUrl:     wpResult.editUrl,
      postStatus:    status,
    }).catch(function(e) {
      console.warn('  [DB警告] postResult登録失敗: ' + e.message);
    });
  }

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

  // スピーチバルーン（wp:html ブロック — 正常記事の構造に合わせる）
  if (generated.speechBalloon) {
    var balloonLines = generated.speechBalloon.split('\n').map(function(l) {
      return escapeHtml(l);
    }).join('<br>');
    parts.push(
      '<!-- wp:html -->\n' +
      '<div class="wp-block-liquid-speech-balloon liquid-speech-balloon-wrap liquid-speech-balloon-00">\n' +
      '<div class="liquid-speech-balloon-avatar">&nbsp;</div>\n' +
      '<div class="liquid-speech-balloon-text">\n' +
      '<p>' + balloonLines + '</p>\n' +
      '<div class="liquid-speech-balloon-arrow">&nbsp;</div>\n' +
      '</div>\n' +
      '</div>\n' +
      '<!-- /wp:html -->'
    );
  }

  // 目次（TOCプラグイン用ショートコード）
  parts.push(
    '<!-- wp:shortcode -->\n' +
    '[toc]\n' +
    '<!-- /wp:shortcode -->'
  );

  // 本文セクション
  if (Array.isArray(generated.headings)) {
    generated.headings.forEach(function(h) {
      var level    = h.level || 2;
      var cssClass = h.cssClass || 'is-style-heading';

      // H2ブロック（className と class は cssClass のみ — wp-block-heading は付けない）
      parts.push(
        '<!-- wp:heading {"level":' + level + ',"className":"' + cssClass + '"} -->\n' +
        '<h' + level + ' class="' + cssClass + '">' + escapeHtml(h.text) + '</h' + level + '>\n' +
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

      // 箇条書き（className と class は listClass のみ — wp-block-list は付けない）
      if (Array.isArray(h.listItems) && h.listItems.length > 0) {
        var listClass = h.listClass || 'is-style-ul-style1';
        var items = h.listItems.map(function(item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('');
        parts.push(
          '<!-- wp:list {"className":"' + listClass + '"} -->\n' +
          '<ul class="' + listClass + '">' + items + '</ul>\n' +
          '<!-- /wp:list -->'
        );
      }
    });
  }

  // まとめ（is-style-heading を付ける）
  if (generated.summary) {
    parts.push(
      '<!-- wp:heading {"className":"is-style-heading"} -->\n' +
      '<h2 class="is-style-heading">まとめ</h2>\n' +
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
