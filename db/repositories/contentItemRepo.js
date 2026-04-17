'use strict';

const { getPrismaClient } = require('../client');

/**
 * レコード処理開始時に呼ぶ（pending 状態で INSERT）。
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.sourceType       - "kintone" | "manual"
 * @param {string} [params.sourceRecordId] - Kintone の $id.value
 * @param {object} params.rawInput         - 生データのスナップショット
 */
async function createItem(params) {
  const db = getPrismaClient();
  return db.contentItem.create({
    data: {
      jobId:          params.jobId,
      sourceType:     params.sourceType,
      sourceRecordId: params.sourceRecordId || null,
      rawInput:       params.rawInput,
      status:         'pending',
    },
  });
}

/**
 * Claude 生成完了後に呼ぶ（generated 状態に更新）。
 * @param {string} itemId
 * @param {object} generated - { pageTitle, expandedText 等 }
 */
async function markGenerated(itemId, generated) {
  const db = getPrismaClient();
  return db.contentItem.update({
    where: { id: itemId },
    data: {
      generatedTitle: generated.pageTitle || generated.title || null,
      generatedBody:  generated.content   || null,
      generatedMeta:  generated,
      status:         'generated',
    },
  });
}

/**
 * WP 投稿完了後に呼ぶ（posted 状態に更新）。
 * @param {string} itemId
 */
async function markPosted(itemId) {
  const db = getPrismaClient();
  return db.contentItem.update({
    where: { id: itemId },
    data: { status: 'posted' },
  });
}

/**
 * エラー発生時に呼ぶ。
 * @param {string} itemId
 * @param {string} errorMessage
 */
async function markError(itemId, errorMessage) {
  const db = getPrismaClient();
  return db.contentItem.update({
    where: { id: itemId },
    data: {
      status:       'error',
      errorMessage: errorMessage,
    },
  });
}

module.exports = { createItem, markGenerated, markPosted, markError };
