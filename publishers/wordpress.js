'use strict';

const { httpRequest } = require('../lib/http');
const { matchMakerName, matchTenpoName } = require('../transformers/extractRecord');

function getWpAuthHeader(siteConfig) {
  return 'Basic ' + Buffer.from(
    siteConfig.wordpress.username + ':' + siteConfig.wordpress.appPassword
  ).toString('base64');
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} filename
 * @param {object} siteConfig
 */
async function uploadImageRestApi(imageBuffer, filename, siteConfig) {
  try {
    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + 'media',
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(siteConfig),
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    }, imageBuffer);

    if (response && response.id) return response.id;
    console.warn('  [警告] REST API 画像アップロードに失敗しました', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return null;
  } catch (err) {
    console.warn('  [警告] 画像アップロード通信エラー: ' + err.message);
    return null;
  }
}

/**
 * @param {string} taxonomy - WP側のタクソノミースラッグ
 * @param {object} siteConfig
 */
async function getTermIdsByTaxonomyRestApi(taxonomy, siteConfig) {
  try {
    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + taxonomy + '?per_page=100',
      method: 'GET',
      headers: { 'Authorization': getWpAuthHeader(siteConfig) },
    });

    if (Array.isArray(response)) {
      return response.map(function(t) {
        return { slug: t.slug, name: t.name || '', term_id: parseInt(t.id, 10) };
      });
    }
    console.warn('  [警告] REST API ターム取得で予期せぬレスポンス（' + taxonomy + '）', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return [];
  } catch (err) {
    console.warn('  [警告] REST API ターム取得通信エラー（' + taxonomy + '）: ' + err.message);
    return [];
  }
}

/**
 * @param {object} data - processRecord内で拡張されたレコードデータ
 * @param {object} expandedText - Claude APIの返り値
 * @param {number|null} featuredImageId
 * @param {object} siteConfig
 */
async function createWordPressDraft(data, expandedText, featuredImageId, siteConfig) {
  const acfMap = siteConfig.acfMapping;
  const taxMap = siteConfig.taxonomyMapping;
  const postType = siteConfig.wordpress.postType || 'example';
  const status = siteConfig.defaultStatus || 'draft';

  // ACFフィールドをサイト別キーでマッピング
  const acf = {};
  acf[acfMap.nayami]        = expandedText.expandedTrouble || '';
  acf[acfMap.point]         = expandedText.expandedReformPoint || '';
  acf[acfMap.koe]           = data.customerVoice || '';
  acf[acfMap.hiyou]         = data.cost || '';
  acf[acfMap.kikan]         = data.period || '';
  acf[acfMap.area]          = data.city || '';
  acf[acfMap.shubetu]       = data.propertyType || '';
  acf[acfMap.tiku]          = data.buildingAge || '';
  acf[acfMap.maker]         = matchMakerName(expandedText.makerName, siteConfig.makerList);
  acf[acfMap.shohin]        = expandedText.productName || '';
  acf[acfMap.menseki]       = data.menseki || '';
  acf[acfMap.tanto_message] = expandedText.expandedTantoMessage || '';
  acf[acfMap.tanto_free]    = data.tanto || '';
  acf[acfMap.tenpo]         = matchTenpoName(data.tenpo, siteConfig.tenpoList);

  const postData = {
    title: expandedText.pageTitle,
    content: '',
    status: status,
    acf: acf,
  };
  if (featuredImageId) postData.featured_media = featuredImageId;

  // タクソノミーをサイト別スラッグ名でセット
  if (taxMap.category && data._categoryTermIds && data._categoryTermIds.length > 0) {
    postData[taxMap.category] = data._categoryTermIds;
  }
  if (taxMap.area && data._areaTermIds && data._areaTermIds.length > 0) {
    postData[taxMap.area] = data._areaTermIds;
  }
  if (taxMap.showroom && data._showroomTermIds && data._showroomTermIds.length > 0) {
    postData[taxMap.showroom] = data._showroomTermIds;
  }

  try {
    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + postType,
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(siteConfig),
        'Content-Type': 'application/json',
      },
    }, JSON.stringify(postData));

    if (!response || !response.id) {
      throw new Error('REST API投稿エラー: ' + (typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response));
    }

    const postId = response.id;

    // after-main / before-main ACF Repeater（PATCH）
    const afterIds = data._afterImageIds || [];
    const beforeIds = data._beforeImageIds || [];
    if (afterIds.length > 0 || beforeIds.length > 0) {
      const patchAcf = {};
      if (afterIds.length > 0) {
        patchAcf[acfMap.afterRepeater] = afterIds.map(function(id) {
          var row = {};
          row[acfMap.afterRepeaterField] = id;
          return row;
        });
      }
      if (beforeIds.length > 0) {
        patchAcf[acfMap.beforeRepeater] = beforeIds.map(function(id) {
          var row = {};
          row[acfMap.beforeRepeaterField] = id;
          return row;
        });
      }
      try {
        await httpRequest({
          url: siteConfig.wordpress.restBase + postType + '/' + postId,
          method: 'PATCH',
          headers: {
            'Authorization': getWpAuthHeader(siteConfig),
            'Content-Type': 'application/json',
          },
        }, JSON.stringify({ acf: patchAcf }));
        console.log('  ACF Repeater登録完了 (施工後' + afterIds.length + '枚 / 施工前' + beforeIds.length + '枚)');
      } catch (patchErr) {
        console.warn('  [警告] ACF Repeater PATCH失敗: ' + patchErr.message);
      }
    }

    return {
      postId: postId,
      draftUrl: siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
      editUrl: (siteConfig.wordpress.adminBase || siteConfig.wordpress.baseUrl + '/wp-admin/') + 'post.php?post=' + postId + '&action=edit',
    };
  } catch (err) {
    console.error('WP Draft 作成エラー: ', err.message);
    throw err;
  }
}

module.exports = { uploadImageRestApi, getTermIdsByTaxonomyRestApi, createWordPressDraft, getWpAuthHeader };
