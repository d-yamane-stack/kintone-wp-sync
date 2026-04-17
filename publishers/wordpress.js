'use strict';

const { CONFIG } = require('../config');
const { httpRequest } = require('../lib/http');
const { matchMakerName, matchTenpoName } = require('../transformers/extractRecord');

function getWpAuthHeader() {
  return 'Basic ' + Buffer.from(CONFIG.wordpress.username + ':' + CONFIG.wordpress.appPassword).toString('base64');
}

async function uploadImageRestApi(imageBuffer, filename) {
  try {
    const response = await httpRequest({
      url: CONFIG.wordpress.restBase + 'media',
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(),
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

async function getTermIdsByTaxonomyRestApi(taxonomy) {
  try {
    const response = await httpRequest({
      url: CONFIG.wordpress.restBase + taxonomy + '?per_page=100',
      method: 'GET',
      headers: { 'Authorization': getWpAuthHeader() },
    });

    if (Array.isArray(response)) {
      return response.map(function(t) { return { slug: t.slug, name: t.name || '', term_id: parseInt(t.id, 10) }; });
    }
    console.warn('  [警告] REST API ターム取得で予期せぬレスポンス（' + taxonomy + '）', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return [];
  } catch (err) {
    console.warn('  [警告] REST API ターム取得通信エラー（' + taxonomy + '）: ' + err.message);
    return [];
  }
}

async function createWordPressDraft(data, expandedText, featuredImageId) {
  const acf = {
    nayami: expandedText.expandedTrouble || '',
    point: expandedText.expandedReformPoint || '',
    koe: data.customerVoice || '',
    hiyou: data.cost || '',
    kikan: data.period || '',
    area: data.city || '',
    shubetu: data.propertyType || '',
    tiku: data.buildingAge || '',
    maker: matchMakerName(expandedText.makerName),
    shohin: expandedText.productName || '',
    menseki: data.menseki || '',
    tanto_message: expandedText.expandedTantoMessage || '',
    tanto_free: data.tanto || '',
    tenpo: matchTenpoName(data.tenpo),
  };

  const postData = {
    title: expandedText.pageTitle,
    content: '',
    status: 'draft',
    acf: acf,
  };
  if (featuredImageId) postData.featured_media = featuredImageId;

  if (data._categoryTermIds && data._categoryTermIds.length > 0) {
    postData.example_category = data._categoryTermIds;
  }
  if (data._areaTermIds && data._areaTermIds.length > 0) {
    postData.example_area = data._areaTermIds;
  }
  if (data._showroomTermIds && data._showroomTermIds.length > 0) {
    postData.example_showroom = data._showroomTermIds;
  }

  const postType = CONFIG.wordpress.postType || 'example';

  try {
    const response = await httpRequest({
      url: CONFIG.wordpress.restBase + postType,
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(),
        'Content-Type': 'application/json',
      },
    }, JSON.stringify(postData));

    if (!response || !response.id) {
      throw new Error('REST API投稿エラー: ' + (typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response));
    }

    const postId = response.id;

    // after-main / before-main ACF Repeaterフィールドを追加送信（PATCH）
    const afterIds = data._afterImageIds || [];
    const beforeIds = data._beforeImageIds || [];
    if (afterIds.length > 0 || beforeIds.length > 0) {
      const patchAcf = {};
      if (afterIds.length > 0) {
        patchAcf['after-main'] = afterIds.map(function(id) { return { 'after-img': id }; });
      }
      if (beforeIds.length > 0) {
        patchAcf['before-main'] = beforeIds.map(function(id) { return { 'before-img': id }; });
      }
      try {
        await httpRequest({
          url: CONFIG.wordpress.restBase + postType + '/' + postId,
          method: 'PATCH',
          headers: {
            'Authorization': getWpAuthHeader(),
            'Content-Type': 'application/json',
          },
        }, JSON.stringify({ acf: patchAcf }));
        console.log('  after-main/before-main ACF登録完了 (施工後' + afterIds.length + '枚 / 施工前' + beforeIds.length + '枚)');
      } catch (patchErr) {
        console.warn('  [警告] after-main/before-main PATCH失敗: ' + patchErr.message);
      }
    }

    return {
      postId: postId,
      draftUrl: CONFIG.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
      editUrl: CONFIG.wordpress.baseUrl + '/wp-admin/post.php?post=' + postId + '&action=edit',
    };
  } catch (err) {
    console.error('WP Draft 作成エラー: ', err.message);
    throw err;
  }
}

module.exports = { uploadImageRestApi, getTermIdsByTaxonomyRestApi, createWordPressDraft, getWpAuthHeader };
