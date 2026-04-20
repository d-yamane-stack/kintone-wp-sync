'use strict';

const fs   = require('fs');
const path = require('path');
const { httpRequest } = require('../lib/http');
const { matchMakerName, matchTenpoName, matchTantoChoice } = require('../transformers/extractRecord');

function getWpAuthHeader(siteConfig) {
  return 'Basic ' + Buffer.from(
    siteConfig.wordpress.username + ':' + siteConfig.wordpress.appPassword
  ).toString('base64');
}

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
 * 画像バッファをWPメディアにアップロードする（コラム自動生成画像用）。
 * @returns {{ id: number, sourceUrl: string } | null}
 */
async function uploadColumnImageBuffer(imageBuffer, filename, siteConfig) {
  try {
    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + 'media',
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(siteConfig),
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(filename) + '"',
      },
    }, imageBuffer);

    if (response && response.id) {
      return { id: response.id, sourceUrl: response.source_url || '' };
    }
    console.warn('  [警告] コラム画像アップロード失敗', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return null;
  } catch (err) {
    console.warn('  [警告] コラム画像アップロードエラー: ' + err.message);
    return null;
  }
}

/**
 * ローカルファイルをWPメディアにアップロードする（既存素材利用時）。
 * @returns {{ id: number, sourceUrl: string } | null}
 */
async function uploadImageFileToWp(filePath, filename, siteConfig) {
  try {
    var buffer = fs.readFileSync(filePath);
    var ext = path.extname(filePath).toLowerCase();
    var mimeType = ext === '.png' ? 'image/png'
                 : ext === '.webp' ? 'image/webp'
                 : 'image/jpeg';

    var safeFilename = Buffer.from(filename, 'utf8').toString('latin1') === filename
      ? filename
      : encodeURIComponent(filename);

    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + 'media',
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(siteConfig),
        'Content-Type': mimeType,
        'Content-Disposition': 'attachment; filename="' + safeFilename + '"',
      },
    }, buffer);

    if (response && response.id) {
      return { id: response.id, sourceUrl: response.source_url || '' };
    }
    console.warn('  [警告] コラム画像アップロード失敗', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return null;
  } catch (err) {
    console.warn('  [警告] コラム画像アップロードエラー: ' + err.message);
    return null;
  }
}

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
 * 施工事例の既存投稿から担当者フィールド(user)の選択肢を収集する。
 * WPユーザー全体ではなく、実際にプルダウンで使われているユーザーIDと名前を取得。
 * 戻り値: [{ value(userId), slug, jaName }]
 */
async function fetchTantoChoices(siteConfig) {
  var choices = [];
  var seenIds = {};
  try {
    var postType = siteConfig.wordpress.postType || 'example';
    // 施工事例投稿を最大200件取得してuserフィールドの値を収集
    var page = 1;
    while (page <= 2) {
      var posts = await httpRequest({
        url: siteConfig.wordpress.restBase + postType + '?per_page=100&page=' + page + '&_fields=acf',
        method: 'GET',
        headers: { 'Authorization': getWpAuthHeader(siteConfig) },
      });
      if (!Array.isArray(posts) || posts.length === 0) break;
      posts.forEach(function(post) {
        if (!post.acf) return;
        // ACF Userフィールドはオブジェクト or ID で返ってくる
        var u = post.acf.user;
        if (!u) return;
        var uid   = typeof u === 'object' ? (u.ID || u.id) : parseInt(u, 10);
        var jname = typeof u === 'object' ? (u.display_name || u.name || '') : '';
        var slug  = typeof u === 'object' ? (u.user_login || u.slug || '') : '';
        if (uid && !seenIds[uid]) {
          seenIds[uid] = true;
          choices.push({ value: uid, slug: slug, jaName: jname });
        }
      });
      if (posts.length < 100) break;
      page++;
    }

    // jaNameが空のエントリはユーザーIDで個別に取得して補完
    for (var i = 0; i < choices.length; i++) {
      if (!choices[i].jaName) {
        try {
          var user = await httpRequest({
            url: siteConfig.wordpress.restBase + 'users/' + choices[i].value + '?_fields=id,slug,name',
            method: 'GET',
            headers: { 'Authorization': getWpAuthHeader(siteConfig) },
          });
          if (user && user.name) {
            choices[i].jaName = user.name;
            choices[i].slug   = user.slug || choices[i].slug;
          }
        } catch (e) { /* 取得失敗は無視 */ }
      }
    }

    console.log('  [担当者] 選択肢取得: ' + choices.length + '件 → ' +
      choices.map(function(c) { return c.jaName + '(id:' + c.value + ')'; }).join(', '));
  } catch (err) {
    console.warn('  [警告] 担当者選択肢の取得に失敗: ' + err.message);
  }
  return choices;
}

async function createWordPressDraft(data, expandedText, featuredImageId, siteConfig, tantoChoices) {
  const acfMap = siteConfig.acfMapping;
  const taxMap = siteConfig.taxonomyMapping;
  const postType = siteConfig.wordpress.postType || 'example';
  const status = siteConfig.defaultStatus || 'draft';

  // 商品名: Kintone1行目パース結果を使用
  var makerValue  = matchMakerName(data.firstLineMaker || expandedText.makerName, siteConfig.makerList);
  var shohinValue = data.firstLineProduct || expandedText.productName || '';
  console.log('  [商品名] makerRaw1行目パース → maker:"' + data.firstLineMaker + '" / product:"' + data.firstLineProduct + '"');
  console.log('  [商品名] WPにセット → maker:"' + makerValue + '" / shohin:"' + shohinValue + '"');

  // 担当者（ACFユーザー型）: WPユーザー一覧から名前マッチしてIDを取得
  var tantoValue = '';
  if (data.tantoUser) {
    console.log('  [担当者] Kintone値: "' + data.tantoUser + '"');
    if (tantoChoices && tantoChoices.length > 0) {
      console.log('  [担当者] WPユーザー一覧: ' + tantoChoices.map(function(c) { return c.jaName + '(id:' + c.value + ')'; }).join(', '));
      tantoValue = matchTantoChoice(data.tantoUser, tantoChoices);
      if (tantoValue) {
        console.log('  [担当者] マッチ成功 → ID:' + tantoValue);
      } else {
        console.warn('  [担当者] マッチ失敗: "' + data.tantoUser + '" に対応するWPユーザーが見つかりませんでした');
      }
    } else {
      console.warn('  [担当者] WPユーザー一覧が空です');
    }
  }

  const acf = {};
  acf[acfMap.nayami]        = expandedText.expandedTrouble || '';
  acf[acfMap.point]         = expandedText.expandedReformPoint || '';
  acf[acfMap.koe]           = data.customerVoice || '';
  acf[acfMap.hiyou]         = data.cost || '';
  acf[acfMap.kikan]         = data.period || '';
  acf[acfMap.area]          = data.city || '';
  acf[acfMap.shubetu]       = data.propertyType || '';
  acf[acfMap.tiku]          = data.buildingAge || '';
  acf[acfMap.maker]         = makerValue;
  acf[acfMap.shohin]        = shohinValue;
  console.log('  [商品名] ACFキー:"' + acfMap.shohin + '" に値:"' + shohinValue + '" をセット');
  acf[acfMap.menseki]       = data.menseki || '';
  acf[acfMap.tanto_message] = expandedText.expandedTantoMessage || data.tantoMessage || '';
  acf[acfMap.tenpo]         = matchTenpoName(data.tenpo, siteConfig.tenpoList);
  // ACFユーザー型: 整数のユーザーIDをセット
  if (acfMap.tanto && tantoValue) {
    acf[acfMap.tanto] = parseInt(tantoValue, 10);
  }

  const postData = {
    title: expandedText.pageTitle,
    content: '',
    status: status,
    acf: acf,
  };
  if (featuredImageId) postData.featured_media = featuredImageId;

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

    const wpStatus = response.status || status;
    const wpDate   = (wpStatus === 'publish' || wpStatus === 'future') ? (response.date || null) : null;
    return {
      postId:     postId,
      postStatus: wpStatus,
      wpDate:     wpDate,
      draftUrl:   siteConfig.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
      editUrl:    (siteConfig.wordpress.adminBase || siteConfig.wordpress.baseUrl + '/wp-admin/') + 'post.php?post=' + postId + '&action=edit',
    };
  } catch (err) {
    console.error('WP Draft 作成エラー: ', err.message);
    throw err;
  }
}

/**
 * WPのタグ（またはカスタムタクソノミー）を全件取得する（コラムタグ自動マッチング用）
 * @param {object} siteConfig
 * @param {string} [taxonomy='tags'] - REST APIエンドポイント名（例: 'tags', 'column_tag'）
 * @returns {Array<{id: number, name: string, slug: string}>}
 */
async function fetchWpTags(siteConfig, taxonomy) {
  var endpoint = (taxonomy || 'tags') + '?per_page=100';
  try {
    const response = await httpRequest({
      url: siteConfig.wordpress.restBase + endpoint,
      method: 'GET',
      headers: { 'Authorization': getWpAuthHeader(siteConfig) },
    });
    if (Array.isArray(response)) {
      return response.map(function(t) {
        return { id: t.id, name: t.name || '', slug: t.slug || '' };
      });
    }
    console.warn('  [警告] タグ取得: 予期せぬレスポンス（taxonomy=' + taxonomy + '）', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return [];
  } catch (err) {
    console.warn('  [警告] WPタグ取得エラー（taxonomy=' + taxonomy + '）: ' + err.message);
    return [];
  }
}

/**
 * WPの公開済みコラムタイトルを取得する（タイトル生成のスタイル参照用）
 * @param {object} siteConfig
 * @param {string} [postType='column']
 * @param {number} [count=12]
 * @returns {string[]}
 */
async function fetchPublishedColumnTitles(siteConfig, postType, count) {
  var pt = postType || 'column';
  var n  = count   || 12;
  try {
    var response = await httpRequest({
      url: siteConfig.wordpress.restBase + pt
        + '?status=publish&per_page=' + n + '&orderby=date&order=desc&_fields=title',
      method: 'GET',
      headers: { 'Authorization': getWpAuthHeader(siteConfig) },
    });
    if (Array.isArray(response)) {
      return response
        .map(function(p) { return p.title && p.title.rendered ? p.title.rendered.replace(/<[^>]+>/g, '') : ''; })
        .filter(Boolean);
    }
    return [];
  } catch (err) {
    console.warn('  [警告] 公開コラムタイトル取得エラー: ' + err.message);
    return [];
  }
}

module.exports = { uploadImageRestApi, uploadColumnImageBuffer, uploadImageFileToWp, getTermIdsByTaxonomyRestApi, fetchWpTags, fetchPublishedColumnTitles, fetchTantoChoices, createWordPressDraft, getWpAuthHeader };
