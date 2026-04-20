'use strict';

const path = require('path');
const { CONFIG } = require('../config');
const { httpRequest } = require('../lib/http');
const { appendColumnToSheet } = require('../logs/logger');
const { createItem, markGenerated, markPosted, markError } = require('../db/repositories/contentItemRepo');
const { createResult } = require('../db/repositories/postResultRepo');
const { uploadColumnImageBuffer, uploadImageFileToWp, fetchWpTags, fetchPublishedColumnTitles } = require('../publishers/wordpress');
const { createColumnImage } = require('../media/generateColumnImage');
const { findColumnImage } = require('../media/columnImage');

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

  // --- 公開済みコラムタイトルを取得（タイトルスタイル参照用）---
  var exampleTitles = [];
  try {
    const colPostType = (siteConfig.columnConfig && siteConfig.columnConfig.postType) || 'column';
    exampleTitles = await fetchPublishedColumnTitles(siteConfig, colPostType, 12);
    if (exampleTitles.length > 0) {
      console.log('  公開コラムタイトル取得: ' + exampleTitles.length + '件');
    }
  } catch (e) {
    console.warn('  [警告] 公開コラムタイトル取得スキップ: ' + e.message);
  }

  // --- プロンプト選択 ---
  const promptKey = (siteConfig.columnPromptKey) || 'column_jube';
  const { buildPrompt } = require('../ai/prompts/' + promptKey);
  const prompt = buildPrompt(Object.assign({}, params, { exampleTitles: exampleTitles }));

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

  // --- コラム画像: 自動生成（Pexels）or 既存素材マッチ → WPアップロード ---
  const colConfig = siteConfig.columnConfig;
  var columnImageId  = null;
  var columnImageUrl = '';

  if (process.env.PEXELS_API_KEY) {
    // ① 優先: Pexels APIで写真取得 → sharp で白枠＋タイトル合成
    console.log('  コラム画像を自動生成中...');
    var imgBuffer = await createColumnImage(generated.pageTitle, params.keyword);
    if (imgBuffer) {
      var slug = 'column-' + Date.now() + '.jpg';
      var imgData = await uploadColumnImageBuffer(imgBuffer, slug, siteConfig);
      if (imgData) {
        columnImageId  = imgData.id;
        columnImageUrl = imgData.sourceUrl;
        console.log('  コラム画像アップロード完了: ID ' + columnImageId);
      }
    }
  } else {
    // ② フォールバック: 既存素材フォルダからタイトルマッチ
    var imageFolder = colConfig && colConfig.columnImageFolder;
    if (imageFolder) {
      console.log('  コラム画像を既存素材から検索中...');
      var imagePath = findColumnImage(generated.pageTitle, imageFolder);
      if (imagePath) {
        console.log('  コラム画像をアップロード中: ' + path.basename(imagePath));
        var fileData = await uploadImageFileToWp(imagePath, path.basename(imagePath), siteConfig);
        if (fileData) {
          columnImageId  = fileData.id;
          columnImageUrl = fileData.sourceUrl;
          console.log('  コラム画像アップロード完了: ID ' + columnImageId);
        }
      }
    }
  }

  // --- WordPress投稿データ組み立て ---
  const rawPostType = (colConfig && colConfig.postType) || 'post';
  // WordPress REST API は標準投稿タイプを複数形で受け付ける（post→posts, page→pages）
  const postType = rawPostType === 'post' ? 'posts' : rawPostType === 'page' ? 'pages' : rawPostType;
  const status   = (colConfig && colConfig.defaultStatus) || 'draft';

  // サイト設定に応じた本文・アイキャッチ制御
  // featuredImageOnly=true の場合: 画像はアイキャッチのみ（本文には挿入しない）
  const featuredImageOnly    = !!(colConfig && colConfig.featuredImageOnly);
  const headingClass         = (colConfig && colConfig.headingClass) || 'is-style-heading';
  const summaryHeadingClass  = Object.prototype.hasOwnProperty.call(colConfig || {}, 'summaryHeadingClass')
    ? colConfig.summaryHeadingClass
    : headingClass;
  const speechBalloonStyle   = (colConfig && colConfig.speechBalloonStyle) || 'html';

  // generated → HTML本文に変換
  const disableCta = !!(colConfig && colConfig.disableCta);

  const content = buildHtmlContent(
    generated,
    featuredImageOnly ? null : columnImageId,
    featuredImageOnly ? ''   : columnImageUrl,
    {
      headingClass:        headingClass,
      summaryHeadingClass: summaryHeadingClass,
      speechBalloonStyle:  speechBalloonStyle,
      disableCta:          disableCta,
    }
  );

  const postData = {
    title: generated.pageTitle,
    content: content,
    status: status,
    excerpt: generated.metaDescription || '',
  };

  // アイキャッチ画像（featured_media）を設定
  if (columnImageId) {
    postData.featured_media = columnImageId;
  }

  // AIOSEO カスタムフィールド（_aioseo_* はWP REST APIに登録済み）
  // コラムタイトル・Meta Description・フォーカスキーフレーズを直接書き込む
  postData.meta = {
    _aioseo_title:       generated.pageTitle       || '',
    _aioseo_description: generated.metaDescription || '',
    _aioseo_keyphrases:  JSON.stringify([{ keyphrase: params.keyword || '', score: 0, analysis: {} }]),
  };

  // カテゴリータクソノミーが設定されていれば付与
  if (colConfig && colConfig.categoryIds && colConfig.categoryIds.length > 0) {
    postData.categories = colConfig.categoryIds;
  }

  // --- WPタグ自動マッチング（最も親和性の高いタグを1つ設定）---
  const tagTaxonomy = (colConfig && colConfig.tagTaxonomy) || 'tags';
  try {
    var wpTags = await fetchWpTags(siteConfig, tagTaxonomy);
    if (wpTags.length > 0) {
      console.log('  タグ一覧取得: ' + wpTags.length + '件 (' + tagTaxonomy + ') → ' + wpTags.map(function(t) { return t.name; }).join(', '));
      var bestTag = matchBestTag(generated.pageTitle, params.keyword, wpTags);
      if (bestTag) {
        postData[tagTaxonomy] = [bestTag.id];
        console.log('  タグ設定: "' + bestTag.name + '" (id:' + bestTag.id + ') → フィールド: ' + tagTaxonomy);
      } else {
        console.log('  タグ: 親和性の高いタグが見つかりませんでした');
      }
    } else {
      console.log('  タグ: ' + tagTaxonomy + ' にタームが登録されていません');
    }
  } catch (tagErr) {
    console.warn('  [警告] タグマッチングをスキップ: ' + tagErr.message);
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
      contentItemId:  itemId,
      wpPostId:       wpResult.postId,
      wpUrl:          wpResult.draftUrl || wpResult.editUrl,
      wpEditUrl:      wpResult.editUrl,
      postStatus:     wpResult.postStatus || status,
      wpPublishedAt:  wpResult.wpDate || null,
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
 * @param {object} generated       - Claude生成データ
 * @param {number|null} imageId    - WPメディアID（コラム画像）※null の場合は挿入しない
 * @param {string}      imageUrl   - メディアURL
 * @param {object}      [opts]     - オプション
 * @param {string}      [opts.headingClass] - H2スタイルクラス名（デフォルト: 'is-style-heading'）
 */
function buildHtmlContent(generated, imageId, imageUrl, opts) {
  var headingClass        = (opts && opts.headingClass)        || 'is-style-heading';
  var summaryHeadingClass = (opts && opts.hasOwnProperty('summaryHeadingClass'))
    ? opts.summaryHeadingClass
    : headingClass;
  var speechBalloonStyle  = (opts && opts.speechBalloonStyle)  || 'html';
  var disableCta          = !!(opts && opts.disableCta);
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

  // スピーチバルーン
  if (generated.speechBalloon) {
    if (speechBalloonStyle === 'shortcode') {
      // ぬりべえ形式: [word_balloon] ショートコード
      // "この記事は、次の人におすすめです！\n・..." → 先頭行＋箇条書きをそのまま埋め込む
      var balloonText = generated.speechBalloon.trim();
      parts.push(
        '<!-- wp:shortcode -->\n' +
        '[word_balloon id="mystery_men" size="M" position="L" name_position="under_avatar" radius="true" name="false"' +
        ' balloon="talk" balloon_shadow="true" icon_type="question" icon_position="top_left" icon_size="M"]\n' +
        balloonText + '\n' +
        '[/word_balloon]\n' +
        '<!-- /wp:shortcode -->'
      );
    } else {
      // 重兵衛形式: HTML div
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
  }

  // コラム画像（スピーチバルーンの直下に挿入）
  if (imageId && imageUrl) {
    parts.push(
      '<!-- wp:image {"id":' + imageId + ',"sizeSlug":"large","linkDestination":"none"} -->\n' +
      '<figure class="wp-block-image size-large">' +
      '<img src="' + imageUrl + '" alt="' + escapeHtml(generated.pageTitle || '') + '" class="wp-image-' + imageId + '"/>' +
      '</figure>\n' +
      '<!-- /wp:image -->'
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
      var cssClass = h.cssClass || headingClass;

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

  // まとめ
  if (generated.summary) {
    var summaryH2 = summaryHeadingClass
      ? '<!-- wp:heading {"className":"' + summaryHeadingClass + '"} -->\n' +
        '<h2 class="' + summaryHeadingClass + '">まとめ</h2>\n' +
        '<!-- /wp:heading -->'
      : '<!-- wp:heading -->\n<h2>まとめ</h2>\n<!-- /wp:heading -->';
    parts.push(summaryH2);
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

  // CTA（disableCta=true のサイトはスキップ）
  if (!disableCta && generated.ctaSection) {
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
  const wpStatus  = response.status || postData.status || 'draft';
  // publish/future の場合は WP が返す date を公開日・予約日として保持
  const wpDate    = (wpStatus === 'publish' || wpStatus === 'future') ? (response.date || null) : null;
  const adminBase = siteConfig.wordpress.adminBase || (siteConfig.wordpress.baseUrl + '/wp-admin/');
  return {
    postId:       postId,
    postStatus:   wpStatus,
    wpDate:       wpDate,
    draftUrl:     siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
    editUrl:      adminBase + 'post.php?post=' + postId + '&action=edit',
  };
}

/**
 * WPタグ一覧からコラムに最も親和性の高いタグを1つ選ぶ。
 * バイグラム（2文字N-gram）類似度で判定（文字集合より文脈を考慮できる）。
 * さらに、タグ名がソーステキストに部分一致する場合はボーナスを加算。
 *
 * @param {string} pageTitle  - 生成タイトル
 * @param {string} keyword    - 入力キーワード
 * @param {Array}  tags       - [{id, name, slug}]
 * @returns {{ id, name } | null}
 */
function matchBestTag(pageTitle, keyword, tags) {
  var normStr = function(s) {
    return (s || '').normalize('NFKC').replace(/[\s　！!？?。、・「」『』【】（）()]/g, '').toLowerCase();
  };

  // バイグラム集合を生成
  var makeBigrams = function(s) {
    var set = new Set();
    for (var i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  // バイグラムJaccard類似度
  var bigramSim = function(a, b) {
    var bgA = makeBigrams(a);
    var bgB = makeBigrams(b);
    if (bgA.size === 0 || bgB.size === 0) return 0;
    var inter = 0;
    bgA.forEach(function(bg) { if (bgB.has(bg)) inter++; });
    var union = bgA.size + bgB.size - inter;
    return union === 0 ? 0 : inter / union;
  };

  // キーワード＋タイトル冒頭（｜より前）を照合ソースに
  var catchphrase = normStr((pageTitle || '').split('｜')[0]);
  var source = normStr(keyword || '') + catchphrase;

  var best = null;
  var bestScore = 0;

  tags.forEach(function(tag) {
    var tagNorm = normStr(tag.name);
    if (!tagNorm) return;

    // バイグラム類似度
    var score = bigramSim(source, tagNorm);

    // 部分一致ボーナス: タグ名がそのままソースに含まれる場合
    if (catchphrase.includes(tagNorm) || source.includes(tagNorm)) {
      score += 0.25;
    }

    if (score > bestScore) {
      bestScore = score;
      best = tag;
      console.log('  [タグ候補] "' + tag.name + '" score=' + score.toFixed(3));
    }
  });

  console.log('  [タグ最高スコア] "' + (best ? best.name : 'なし') + '" = ' + bestScore.toFixed(3));
  // 閾値 0.08 以上でマッチとみなす（バイグラムは文字集合より厳しいため低めに設定）
  return bestScore >= 0.08 ? best : null;
}

module.exports = { runColumnPipeline };
