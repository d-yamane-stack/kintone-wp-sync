'use strict';

const { getPrismaClient } = require('../client');

/**
 * WP 投稿成功後に呼ぶ。post_results に INSERT。
 * @param {object} params
 * @param {string} params.contentItemId
 * @param {number} params.wpPostId
 * @param {string} params.wpUrl
 * @param {string} params.wpEditUrl
 * @param {string} params.postStatus  - "draft" | "publish"
 */
async function createResult(params) {
  const db = getPrismaClient();
  return db.postResult.create({
    data: {
      contentItemId: params.contentItemId,
      wpPostId:      params.wpPostId,
      wpUrl:         params.wpUrl,
      wpEditUrl:     params.wpEditUrl,
      postStatus:    params.postStatus || 'draft',
    },
  });
}

module.exports = { createResult };
