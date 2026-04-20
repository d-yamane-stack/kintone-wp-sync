'use strict';

const { getPrismaClient } = require('../client');

/**
 * WP 投稿成功後に呼ぶ。post_results に INSERT。
 * @param {object} params
 * @param {string} params.contentItemId
 * @param {number} params.wpPostId
 * @param {string} params.wpUrl
 * @param {string} params.wpEditUrl
 * @param {string} params.postStatus    - "draft" | "publish" | "future"
 * @param {string} [params.wpPublishedAt] - WPが返す公開日・予約日（ISO文字列）
 */
async function createResult(params) {
  const db = getPrismaClient();
  var data = {
    contentItemId: params.contentItemId,
    wpPostId:      params.wpPostId,
    wpUrl:         params.wpUrl,
    wpEditUrl:     params.wpEditUrl,
    postStatus:    params.postStatus || 'draft',
  };
  if (params.wpPublishedAt) {
    data.wpPublishedAt = new Date(params.wpPublishedAt);
  }
  return db.postResult.create({ data: data });
}

module.exports = { createResult };
