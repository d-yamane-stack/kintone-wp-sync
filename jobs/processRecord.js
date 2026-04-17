'use strict';

const { extractRecordData, matchTenpoName } = require('../transformers/extractRecord');
const { expandTextWithClaude } = require('../ai/claudeClient');
const { downloadKintoneImage } = require('../sources/kintone');
const { cleanseImage } = require('../media/imageProcessor');
const { uploadImageRestApi, getTermIdsByTaxonomyRestApi, createWordPressDraft } = require('../publishers/wordpress');
const { appendToSheet } = require('../logs/logger');
const { sleep } = require('../lib/http');
const { createItem, markGenerated, markPosted, markError } = require('../db/repositories/contentItemRepo');
const { createResult } = require('../db/repositories/postResultRepo');

/**
 * 1レコード分の処理フロー
 *
 * @param {object} record - Kintoneレコード
 * @param {object} context
 * @param {object} context.siteConfig    - sites/siteConfigs.js の1サイト設定（必須）
 * @param {string} [context.jobId]       - processBatch が生成したジョブID
 * @param {object} [context.fetchedTerms] - タクソノミーキャッシュ（バッチ内で共有）
 */
async function processRecord(record, context) {
  context = context || {};
  const siteConfig = context.siteConfig;
  if (!siteConfig) throw new Error('context.siteConfig が必要です');

  if (!context.fetchedTerms) {
    context.fetchedTerms = { category: null, area: null, showroom: null };
  }
  const fetchedTerms = context.fetchedTerms;
  const taxMap = siteConfig.taxonomyMapping;

  const data = extractRecordData(record);
  console.log('\n処理開始: レコードID ' + data.recordId + ' / ' + (data.area || '施工箇所不明'));

  // ---- DB: コンテンツアイテムを pending で登録 ----
  var itemId = null;
  if (context.jobId) {
    try {
      const item = await createItem({
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

  // --- Claude テキスト拡張 ---
  console.log('  Claude APIでテキスト拡張中...');
  var expandedText;
  try {
    expandedText = await expandTextWithClaude(data, siteConfig);
    console.log('  タイトル: ' + expandedText.pageTitle);

    // ---- DB: 生成完了を記録 ----
    if (itemId) {
      try { await markGenerated(itemId, expandedText); } catch (e) { console.warn('  [DB警告] ' + e.message); }
    }
  } catch (err) {
    if (itemId) {
      try { await markError(itemId, err.message); } catch (e) { /* ignore */ }
    }
    throw err;
  }

  // --- 画像処理 ---
  const afterImages  = data.afterImages  || [];
  const beforeImages = data.beforeImages || [];
  const duringImages = data.duringImages || [];
  const allImages    = [].concat(afterImages, beforeImages, duringImages);

  let featuredImageId = null;

  if (allImages.length > 0) {
    console.log('  画像クレンジング＆アップロード中... (' + allImages.length + '枚)');
    const afterIds  = await uploadImageGroup(afterImages,  data.recordId, 'after',  siteConfig);
    const beforeIds = await uploadImageGroup(beforeImages, data.recordId, 'before', siteConfig);
    const duringIds = await uploadImageGroup(duringImages, data.recordId, 'during', siteConfig);
    data._afterImageIds  = afterIds;
    data._beforeImageIds = beforeIds;
    data._duringImageIds = duringIds;
    console.log('  画像アップロード完了: 施工後' + afterIds.length + '枚 / 施工中' + duringIds.length + '枚 / 施工前' + beforeIds.length + '枚');
  }

  // --- タクソノミー解決 ---
  console.log('  タクソノミー情報を準備中...');
  const categoryMap = taxMap.categoryMap || {};
  const areaMap     = taxMap.areaMap     || {};

  const categorySlugsToSet = [];
  (data.rawArea || []).forEach(function(val) {
    if (categoryMap[val]) categorySlugsToSet.push(categoryMap[val]);
  });

  const areaSlugsToSet = [];
  if (data.location) {
    for (var key in areaMap) {
      if (data.location.includes(key)) { areaSlugsToSet.push(areaMap[key]); break; }
    }
  }

  data._categorySlugs = categorySlugsToSet;
  data._areaSlugs = areaSlugsToSet;

  try {
    if (!fetchedTerms.category && categorySlugsToSet.length > 0 && taxMap.category) {
      fetchedTerms.category = await getTermIdsByTaxonomyRestApi(taxMap.category, siteConfig);
    }
    if (!fetchedTerms.area && areaSlugsToSet.length > 0 && taxMap.area) {
      fetchedTerms.area = await getTermIdsByTaxonomyRestApi(taxMap.area, siteConfig);
    }
    if (!fetchedTerms.showroom && taxMap.showroom) {
      fetchedTerms.showroom = await getTermIdsByTaxonomyRestApi(taxMap.showroom, siteConfig);
    }
  } catch (err) {
    console.warn('  [警告] ターム取得に失敗しましたが処理を継続します: ' + err.message);
  }

  const tCategoryIds  = resolveTermIds(fetchedTerms.category, categorySlugsToSet, taxMap.category || 'category');
  const tAreaIds      = resolveTermIds(fetchedTerms.area,     areaSlugsToSet,     taxMap.area     || 'area');
  const tShowroomIds  = resolveShowroomIds(fetchedTerms.showroom, matchTenpoName(data.tenpo, siteConfig.tenpoList));

  data._categoryTermIds  = tCategoryIds;
  data._areaTermIds      = tAreaIds;
  data._showroomTermIds  = tShowroomIds;

  const tenpoWpName = matchTenpoName(data.tenpo, siteConfig.tenpoList);
  if (categorySlugsToSet.length > 0) console.log('  設定予定の' + (taxMap.category || 'category') + ' (' + tCategoryIds.length + '件): ' + categorySlugsToSet.join(', '));
  if (areaSlugsToSet.length > 0)     console.log('  設定予定の' + (taxMap.area     || 'area')     + ' (' + tAreaIds.length     + '件): ' + areaSlugsToSet.join(', '));
  if (tenpoWpName)                   console.log('  設定予定の' + (taxMap.showroom  || 'showroom') + ' (' + tShowroomIds.length  + '件): ' + tenpoWpName);

  // --- WordPress投稿 ---
  console.log('  WordPressに下書き投稿中...');
  var wpResult;
  try {
    wpResult = await createWordPressDraft(data, expandedText, featuredImageId, siteConfig);
    console.log('  下書き作成完了: ' + wpResult.editUrl);

    // ---- DB: 投稿結果を記録 ----
    if (itemId) {
      try {
        await markPosted(itemId);
        await createResult({
          contentItemId: itemId,
          wpPostId:      wpResult.postId,
          wpUrl:         wpResult.draftUrl,
          wpEditUrl:     wpResult.editUrl,
          postStatus:    siteConfig.defaultStatus || 'draft',
        });
      } catch (dbErr) {
        console.warn('  [DB警告] 投稿結果記録に失敗しました: ' + dbErr.message);
      }
    }
  } catch (err) {
    if (itemId) {
      try { await markError(itemId, err.message); } catch (e) { /* ignore */ }
    }
    throw err;
  }

  // --- Sheets記録（補助ログ／段階移行中は並走）---
  try {
    console.log('  スプレッドシートに記録中...');
    await appendToSheet(data, expandedText, wpResult);
    console.log('  スプレッドシート記録完了');
  } catch (sheetErr) {
    // Sheets 記録失敗はエラーにしない（DBが正本のため）
    console.warn('  [警告] スプレッドシート記録に失敗しました（処理は継続）: ' + sheetErr.message);
  }

  return { data, expandedText, wpResult };
}

// --- helpers ---

async function uploadImageGroup(images, recordId, label, siteConfig) {
  const ids = [];
  for (var i = 0; i < images.length; i++) {
    try {
      const fileKey = images[i].fileKey || images[i];
      const imgResult = await downloadKintoneImage(fileKey);
      const cleansedBuffer = await cleanseImage(imgResult.buffer);
      const mediaId = await uploadImageRestApi(
        cleansedBuffer,
        'jirei-' + recordId + '-' + label + '-' + (i + 1) + '.jpg',
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

function resolveTermIds(terms, slugs, taxonomyName) {
  const ids = [];
  if (!terms) return ids;
  slugs.forEach(function(slug) {
    var t = terms.find(function(i) { return i.slug === slug; });
    if (t) ids.push(t.term_id);
    else console.log('    ※' + taxonomyName + 'のターム(slug: ' + slug + ')がWordPress側に見つかりません');
  });
  return ids;
}

function resolveShowroomIds(terms, tenpoWpName) {
  const ids = [];
  if (!terms || !tenpoWpName) return ids;
  const tenpoNorm = tenpoWpName.toLowerCase();
  terms.forEach(function(term) {
    var termName = (term.name || '').toLowerCase();
    var termSlug = (term.slug || '').toLowerCase();
    if (termName.includes(tenpoNorm) || tenpoNorm.includes(termName) ||
        termSlug.includes(tenpoNorm) || tenpoNorm.includes(termSlug)) {
      ids.push(term.term_id);
    }
  });
  return ids;
}

module.exports = { processRecord };
