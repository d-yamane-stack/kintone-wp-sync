'use strict';

/**
 * ぬりべえ施工事例 1レコード分の処理フロー
 *
 * Kintone App 513 → WP properties 投稿
 *
 * 処理内容:
 *   1. レコードデータ抽出
 *   2. Claude Haiku でタイトル生成
 *   3. 画像ダウンロード & WPアップロード
 *      - 施工後  → after-main repeater + featured_media (先頭1枚)
 *      - 施工中  → under-main repeater (5種類合算)
 *      - 施工前  → before-main repeater
 *      - 集合写真 → syuugou 単一
 *   4. WP properties 下書き投稿 (ACFフィールド含む)
 *   5. DB記録
 */

const { extractNurubeRecordData } = require('../transformers/extractNurubeRecord');
const { downloadKintoneImage }     = require('../sources/kintone');
const { cleanseImage }             = require('../media/imageProcessor');
const { uploadImageRestApi, fetchTantoChoices, getWpAuthHeader } = require('../publishers/wordpress');
const { httpRequest, sleep }       = require('../lib/http');
const { matchTantoChoice }         = require('../transformers/extractRecord');
const { createItem, markGenerated, markPosted, markError } = require('../db/repositories/contentItemRepo');
const { createResult }             = require('../db/repositories/postResultRepo');

var NURUBE_API_TOKEN = process.env.NURUBE_KINTONE_API_TOKEN || '';

/**
 * @param {object} record - Kintoneレコード
 * @param {object} context
 * @param {object} context.siteConfig  - ぬりべえのサイト設定
 * @param {string} [context.jobId]
 * @param {object} [context.fetchedTerms]
 */
async function processNurubeRecord(record, context) {
  context = context || {};
  var siteConfig = context.siteConfig;
  if (!siteConfig) throw new Error('context.siteConfig が必要です');

  if (!context.fetchedTerms) {
    context.fetchedTerms = { tantoChoices: null };
  }

  var data = extractNurubeRecordData(record);
  console.log('\n[ぬりべえ] 処理開始: レコードID ' + data.recordId + ' / ' + (data.area || '施工箇所不明') + ' / ' + (data.city || '住所不明'));

  // ---- DB: コンテンツアイテムを pending で登録 ----
  var itemId = null;
  if (context.jobId) {
    try {
      var item = await createItem({
        jobId:          context.jobId,
        sourceType:     'kintone',
        sourceRecordId: String(data.recordId),
        rawInput:       data,
      });
      itemId = item.id;
    } catch (dbErr) {
      console.warn('  [DB警告] アイテム登録に失敗しました: ' + dbErr.message);
    }
  }

  // ---- Claude Haiku でタイトル生成 ----
  console.log('  タイトル生成中 (Claude Haiku)...');
  var pageTitle;
  try {
    pageTitle = await generateNurubeTitle(data);
    console.log('  タイトル: ' + pageTitle);

    if (itemId) {
      try { await markGenerated(itemId, { pageTitle: pageTitle }); } catch (e) { console.warn('  [DB警告] ' + e.message); }
    }
  } catch (err) {
    if (itemId) { try { await markError(itemId, err.message); } catch (e) { /* ignore */ } }
    throw err;
  }

  // ---- 画像アップロード ----
  var featuredImageId = null;
  var afterImageIds   = [];
  var underImageIds   = [];
  var beforeImageIds  = [];
  var syugouImageId   = null;

  // 施工後
  if (data.afterImages && data.afterImages.length > 0) {
    console.log('  施工後写真アップロード中 (' + data.afterImages.length + '枚)...');
    afterImageIds = await uploadImageGroup(data.afterImages, data.recordId, 'after', siteConfig);
    if (afterImageIds.length > 0) featuredImageId = afterImageIds[0];
  }

  // 施工中 (合算)
  if (data.duringImages && data.duringImages.length > 0) {
    console.log('  施工中写真アップロード中 (' + data.duringImages.length + '枚)...');
    underImageIds = await uploadImageGroup(data.duringImages, data.recordId, 'under', siteConfig);
  }

  // 施工前
  if (data.beforeImages && data.beforeImages.length > 0) {
    console.log('  施工前写真アップロード中 (' + data.beforeImages.length + '枚)...');
    beforeImageIds = await uploadImageGroup(data.beforeImages, data.recordId, 'before', siteConfig);
  }

  // 集合写真
  if (data.syugouImage) {
    console.log('  集合写真アップロード中...');
    try {
      var fileKey = data.syugouImage.fileKey || data.syugouImage;
      var syugouBuf = await downloadKintoneImage(fileKey, NURUBE_API_TOKEN);
      var cleansed  = await cleanseImage(syugouBuf.buffer);
      syugouImageId = await uploadImageRestApi(cleansed, 'nurube-' + data.recordId + '-syugou.jpg', siteConfig);
      if (syugouImageId) console.log('  集合写真アップロード完了: ID ' + syugouImageId);
    } catch (err) {
      console.warn('  [警告] 集合写真アップロード失敗: ' + err.message);
    }
  }

  console.log('  画像アップロード完了: 施工後' + afterImageIds.length + '枚 / 中' + underImageIds.length + '枚 / 前' + beforeImageIds.length + '枚');

  // ---- 担当者取得 ----
  if (!context.fetchedTerms.tantoChoices) {
    context.fetchedTerms.tantoChoices = await fetchTantoChoices(siteConfig);
  }
  var tantoValue = '';
  if (data.tantoUser && context.fetchedTerms.tantoChoices && context.fetchedTerms.tantoChoices.length > 0) {
    tantoValue = matchTantoChoice(data.tantoUser, context.fetchedTerms.tantoChoices);
    if (tantoValue) {
      console.log('  [担当者] マッチ成功 → ID:' + tantoValue);
    } else {
      console.warn('  [担当者] マッチ失敗: "' + data.tantoUser + '"');
    }
  }

  // ---- WP投稿 ----
  console.log('  WordPressに下書き投稿中...');
  var wpResult;
  try {
    wpResult = await createNurubeWordPressDraft(data, pageTitle, featuredImageId, siteConfig, tantoValue, {
      afterImageIds:  afterImageIds,
      underImageIds:  underImageIds,
      beforeImageIds: beforeImageIds,
      syugouImageId:  syugouImageId,
    });
    console.log('  下書き作成完了: ' + wpResult.editUrl);

    if (itemId) {
      try {
        await markPosted(itemId);
        await createResult({
          contentItemId: itemId,
          wpPostId:      wpResult.postId,
          wpUrl:         wpResult.draftUrl,
          wpEditUrl:     wpResult.editUrl,
          postStatus:    wpResult.postStatus || siteConfig.defaultStatus || 'draft',
          wpPublishedAt: wpResult.wpDate || null,
        });
      } catch (dbErr) {
        console.warn('  [DB警告] 投稿結果記録に失敗しました: ' + dbErr.message);
      }
    }
  } catch (err) {
    if (itemId) { try { await markError(itemId, err.message); } catch (e) { /* ignore */ } }
    throw err;
  }

  return { data, pageTitle, wpResult };
}

// ---------------------------------------------------------------------------
// タイトル生成 (Claude Haiku)
// ---------------------------------------------------------------------------

async function generateNurubeTitle(data) {
  var prompt = 'あなたはリフォーム会社のWEB担当者です。\n'
    + '以下の施工事例情報から、WordPress投稿タイトルを1行だけ生成してください。\n\n'
    + '施工箇所: ' + (data.area || '外壁塗装') + '\n'
    + '地名: ' + (data.city || data.location || '') + '\n'
    + '塗料種類: ' + (data.paintType || '') + '\n'
    + '外壁種類: ' + (data.wallType || '') + '\n'
    + '屋根種類: ' + (data.roofType || '') + '\n\n'
    + '【タイトル形式】「地名｜施工箇所の施工事例」という形式にすること。\n'
    + '例: "千葉市｜外壁塗装・屋根塗装の施工事例"\n'
    + '例: "柏市｜外壁塗装（ラジカル塗料）の施工事例"\n'
    + '【禁止】markdown, コードブロック, 説明文は不要。タイトル文字列のみ返すこと。';

  var response = await httpRequest({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
  }, JSON.stringify({
    model:      'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  }));

  if (response && response.content && response.content[0] && response.content[0].text) {
    return response.content[0].text.trim().replace(/^"|"$/g, '');
  }
  // フォールバック: 地名+施工箇所
  var fallback = (data.city || '') + (data.city && data.area ? '｜' : '') + (data.area || '施工事例');
  return fallback + 'の施工事例';
}

// ---------------------------------------------------------------------------
// Kintone 塗料種類 → WP ACF maker enum マッピング
// WP enum: ウレタン塗料, シリコン塗料, ラジカル塗料, 遮熱塗料, フッ素塗料, 無機塗料
// ---------------------------------------------------------------------------
function mapKintonePaintToWpEnum(paintType) {
  if (!paintType) return '';
  var p = paintType.trim();
  if (p.includes('無機'))   return '無機塗料';
  if (p.includes('フッ素'))  return 'フッ素塗料';
  if (p.includes('遮熱'))   return '遮熱塗料';
  if (p.includes('ラジカル')) return 'ラジカル塗料';
  if (p.includes('シリコン')) return 'シリコン塗料';
  if (p.includes('ウレタン')) return 'ウレタン塗料';
  return ''; // マッチしない場合は送信しない
}

// ---------------------------------------------------------------------------
// WP下書き投稿作成
// ---------------------------------------------------------------------------

async function createNurubeWordPressDraft(data, pageTitle, featuredImageId, siteConfig, tantoValue, images) {
  var postType = siteConfig.wordpress.postType || 'properties';
  var status   = siteConfig.defaultStatus || 'draft';
  var acfMap   = siteConfig.acfMapping || {};

  // ACFフィールドを組み立て
  var acf = {};

  // テキスト系フィールド
  if (acfMap.nayami)        acf[acfMap.nayami]        = data.trouble       || '';
  if (acfMap.point)         acf[acfMap.point]          = data.reformPoint   || '';
  if (acfMap.koe)           acf[acfMap.koe]            = data.customerVoice || '';
  if (acfMap.hiyou)         acf[acfMap.hiyou]          = data.cost          || '';
  if (acfMap.kikan)         acf[acfMap.kikan]          = data.period        || '';
  if (acfMap.menseki)       acf[acfMap.menseki]        = data.menseki       || '';
  if (acfMap.tiku)          acf[acfMap.tiku]           = data.buildingAge   || '';
  if (acfMap.tanto_message) acf[acfMap.tanto_message]  = data.tantoMessage  || '';
  // tenpo: Kintoneに店舗フィールドなし → enum validationエラーを避けるため送信しない

  // 担当者 (ACF Select型: WPユーザーIDを文字列で渡す)
  if (acfMap.tanto && tantoValue) {
    acf[acfMap.tanto] = String(tantoValue);
  }

  // maker フィールド: WP側がenum(塗料種類選択)のため Kintoneの塗料種類をマッピング
  // 一致しない場合は送信しない (WP管理画面で手動設定)
  if (acfMap.maker && data.paintType) {
    var makerEnum = mapKintonePaintToWpEnum(data.paintType);
    if (makerEnum) acf[acfMap.maker] = makerEnum;
  }

  var postData = {
    title:   pageTitle,
    content: '',
    status:  status,
    acf:     acf,
  };

  if (featuredImageId) postData.featured_media = featuredImageId;

  // POST 投稿
  var response = await httpRequest({
    url: siteConfig.wordpress.restBase + postType,
    method: 'POST',
    headers: {
      'Authorization': getWpAuthHeader(siteConfig),
      'Content-Type':  'application/json',
    },
  }, JSON.stringify(postData));

  if (!response || !response.id) {
    throw new Error('WP投稿エラー: ' + (typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response));
  }

  var postId = response.id;

  // ---- ACF Repeater / 単一画像フィールド を PATCH ----
  await patchNurubeRepeaters(postId, data, images, siteConfig, acfMap);

  var wpStatus = response.status || status;
  var wpDate   = (wpStatus === 'publish' || wpStatus === 'future') ? (response.date || null) : null;

  return {
    postId:     postId,
    postStatus: wpStatus,
    wpDate:     wpDate,
    draftUrl:   siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
    editUrl:    (siteConfig.wordpress.adminBase || siteConfig.wordpress.baseUrl + '/wp-admin/') + 'post.php?post=' + postId + '&action=edit',
  };
}

async function patchNurubeRepeaters(postId, data, images, siteConfig, acfMap) {
  var postType = siteConfig.wordpress.postType || 'properties';
  var patchAcf = {};
  var hasPatch = false;

  // after-main (施工後写真)
  if (acfMap.afterRepeater && images.afterImageIds && images.afterImageIds.length > 0) {
    patchAcf[acfMap.afterRepeater] = images.afterImageIds.map(function(id) {
      var row = {};
      row[acfMap.afterRepeaterField || 'after-img'] = id;
      return row;
    });
    hasPatch = true;
  }

  // under-main (施工中写真)
  if (acfMap.duringRepeater && images.underImageIds && images.underImageIds.length > 0) {
    patchAcf[acfMap.duringRepeater] = images.underImageIds.map(function(id) {
      var row = {};
      row[acfMap.duringRepeaterField || 'under-img'] = id;
      return row;
    });
    hasPatch = true;
  }

  // before-main (施工前写真)
  if (acfMap.beforeRepeater && images.beforeImageIds && images.beforeImageIds.length > 0) {
    patchAcf[acfMap.beforeRepeater] = images.beforeImageIds.map(function(id) {
      var row = {};
      row[acfMap.beforeRepeaterField || 'before-img'] = id;
      return row;
    });
    hasPatch = true;
  }

  // syuugou (集合写真: 単一画像ID)
  if (acfMap.syugou && images.syugouImageId) {
    patchAcf[acfMap.syugou] = images.syugouImageId;
    hasPatch = true;
  }

  // buzai-wrap (材料リスト repeater)
  if (acfMap.buzaiRepeater && data.buzaiItems && data.buzaiItems.length > 0) {
    patchAcf[acfMap.buzaiRepeater] = data.buzaiItems.map(function(item) {
      var row = {};
      row[acfMap.makerField   || 'mekar2'] = item.mekar2 || '';
      row[acfMap.productField || 'name2']  = item.name2  || '';
      return row;
    });
    hasPatch = true;
  }

  if (!hasPatch) return;

  try {
    await httpRequest({
      url: siteConfig.wordpress.restBase + postType + '/' + postId,
      method: 'PATCH',
      headers: {
        'Authorization': getWpAuthHeader(siteConfig),
        'Content-Type':  'application/json',
      },
    }, JSON.stringify({ acf: patchAcf }));

    console.log('  ACFリピーター登録完了 (後' + (images.afterImageIds || []).length
      + '枚 / 中' + (images.underImageIds || []).length
      + '枚 / 前' + (images.beforeImageIds || []).length + '枚)');
  } catch (patchErr) {
    console.warn('  [警告] ACFリピーターPATCH失敗: ' + patchErr.message);
  }
}

// ---------------------------------------------------------------------------
// 画像アップロードヘルパー
// ---------------------------------------------------------------------------

async function uploadImageGroup(images, recordId, label, siteConfig) {
  var ids = [];
  for (var i = 0; i < images.length; i++) {
    try {
      var fileKey    = images[i].fileKey || images[i];
      var imgResult  = await downloadKintoneImage(fileKey, NURUBE_API_TOKEN);
      var cleansed   = await cleanseImage(imgResult.buffer);
      var mediaId    = await uploadImageRestApi(
        cleansed,
        'nurube-' + recordId + '-' + label + '-' + (i + 1) + '.jpg',
        siteConfig
      );
      if (mediaId) {
        ids.push(mediaId);
        console.log('  ' + label + '写真 ' + (i + 1) + '/' + images.length + ' アップロード完了: ID ' + mediaId);
      }
      await sleep(500);
    } catch (err) {
      console.warn('  ' + label + '写真 ' + (i + 1) + ' 失敗: ' + err.message);
    }
  }
  return ids;
}

module.exports = { processNurubeRecord };
