'use strict';

const { CATEGORY_MAP, AREA_MAP } = require('../config');
const { extractRecordData, matchTenpoName } = require('../transformers/extractRecord');
const { expandTextWithClaude } = require('../ai/claudeClient');
const { downloadKintoneImage } = require('../sources/kintone');
const { cleanseImage } = require('../media/imageProcessor');
const { uploadImageRestApi, getTermIdsByTaxonomyRestApi, createWordPressDraft } = require('../publishers/wordpress');
const { appendToSheet } = require('../logs/logger');
const { sleep } = require('../lib/http');

// タクソノミーターム一覧はバッチ内でキャッシュ（呼び出し元から context として渡す）
async function processRecord(record, context) {
  context = context || {};
  // fetchedTerms をバッチ間で共有するためcontextに持たせる
  if (!context.fetchedTerms) {
    context.fetchedTerms = {
      example_category: null,
      example_area: null,
      example_showroom: null,
    };
  }
  const fetchedTerms = context.fetchedTerms;

  const data = extractRecordData(record);
  console.log('\n処理開始: レコードID ' + data.recordId + ' / ' + (data.area || '施工箇所不明'));

  // --- Claude テキスト拡張 ---
  console.log('  Claude APIでテキスト拡張中...');
  const expandedText = await expandTextWithClaude(data);
  console.log('  タイトル: ' + expandedText.pageTitle);

  // --- 画像処理 ---
  const afterImages = data.afterImages || [];
  const beforeImages = data.beforeImages || [];
  const duringImages = data.duringImages || [];
  const allImages = [].concat(afterImages, beforeImages, duringImages);

  let featuredImageId = null;

  if (allImages.length > 0) {
    console.log('  画像クレンジング＆アップロード中... (' + allImages.length + '枚)');

    const afterIds = await uploadImageGroup(afterImages, data.recordId, 'after');
    const beforeIds = await uploadImageGroup(beforeImages, data.recordId, 'before');
    const duringIds = await uploadImageGroup(duringImages, data.recordId, 'during');

    data._afterImageIds = afterIds;
    data._beforeImageIds = beforeIds;
    data._duringImageIds = duringIds;
    console.log('  画像アップロード完了: 施工後' + afterIds.length + '枚 / 施工中' + duringIds.length + '枚 / 施工前' + beforeIds.length + '枚');
  }

  // --- タクソノミー解決 ---
  console.log('  タクソノミー情報を準備中...');
  const categorySlugsToSet = [];
  (data.rawArea || []).forEach(function(val) {
    if (CATEGORY_MAP[val]) categorySlugsToSet.push(CATEGORY_MAP[val]);
  });

  const areaSlugsToSet = [];
  if (data.location) {
    for (var key in AREA_MAP) {
      if (data.location.includes(key)) {
        areaSlugsToSet.push(AREA_MAP[key]);
        break;
      }
    }
  }

  data._categorySlugs = categorySlugsToSet;
  data._areaSlugs = areaSlugsToSet;

  try {
    if (!fetchedTerms.example_category && categorySlugsToSet.length > 0) {
      fetchedTerms.example_category = await getTermIdsByTaxonomyRestApi('example_category');
    }
    if (!fetchedTerms.example_area && areaSlugsToSet.length > 0) {
      fetchedTerms.example_area = await getTermIdsByTaxonomyRestApi('example_area');
    }
    if (!fetchedTerms.example_showroom) {
      fetchedTerms.example_showroom = await getTermIdsByTaxonomyRestApi('example_showroom');
    }
  } catch (err) {
    console.warn('  [警告] ターム取得に失敗しましたが処理を継続します: ' + err.message);
  }

  const tCategoryIds = resolveTermIds(fetchedTerms.example_category, categorySlugsToSet, 'example_category');
  const tAreaIds = resolveTermIds(fetchedTerms.example_area, areaSlugsToSet, 'example_area');
  const tShowroomIds = resolveShowroomIds(fetchedTerms.example_showroom, matchTenpoName(data.tenpo));

  data._categoryTermIds = tCategoryIds;
  data._areaTermIds = tAreaIds;
  data._showroomTermIds = tShowroomIds;

  const tenpoWpName = matchTenpoName(data.tenpo);
  if (categorySlugsToSet.length > 0) console.log('  設定予定のexample_category (' + tCategoryIds.length + '件): ' + categorySlugsToSet.join(', '));
  if (areaSlugsToSet.length > 0) console.log('  設定予定のexample_area (' + tAreaIds.length + '件): ' + areaSlugsToSet.join(', '));
  if (tenpoWpName) console.log('  設定予定のexample_showroom (' + tShowroomIds.length + '件): ' + tenpoWpName);

  // --- WordPress投稿 ---
  console.log('  WordPressに下書き投稿中...');
  const wpResult = await createWordPressDraft(data, expandedText, featuredImageId);
  console.log('  下書き作成完了: ' + wpResult.editUrl);

  // --- Sheets記録 ---
  console.log('  スプレッドシートに記録中...');
  await appendToSheet(data, expandedText, wpResult);
  console.log('  スプレッドシート記録完了');

  return { data, expandedText, wpResult };
}

// --- helpers ---

async function uploadImageGroup(images, recordId, label) {
  const ids = [];
  for (var i = 0; i < images.length; i++) {
    try {
      const fileKey = images[i].fileKey || images[i];
      const imgResult = await downloadKintoneImage(fileKey);
      const cleansedBuffer = await cleanseImage(imgResult.buffer);
      const mediaId = await uploadImageRestApi(cleansedBuffer, 'jirei-' + recordId + '-' + label + '-' + (i + 1) + '.jpg');
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
