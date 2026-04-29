'use strict';

/**
 * SEOキーワード・順位レコード リポジトリ
 */

const { getPrismaClient } = require('../client');
const db = getPrismaClient();

// -------------------------------------------------------
// キーワード管理
// -------------------------------------------------------

/** キーワード一覧取得（最新順位付き） */
async function listSeoKeywords(siteId) {
  const where = { isActive: true };
  if (siteId) where.siteId = siteId;

  const keywords = await db.seoKeyword.findMany({
    where,
    orderBy: [{ siteId: 'asc' }, { keyword: 'asc' }],
    include: {
      rankRecords: {
        orderBy: { checkedAt: 'desc' },
        take: 2, // 最新2件（現在 + 前回）
      },
    },
  });

  return keywords.map(function(kw) {
    const latest = kw.rankRecords[0] || null;
    const prev   = kw.rankRecords[1] || null;
    return {
      id:           kw.id,
      siteId:       kw.siteId,
      keyword:      kw.keyword,
      targetUrl:    kw.targetUrl,
      isOwn:        kw.isOwn,
      isActive:     kw.isActive,
      createdAt:    kw.createdAt,
      position:     latest ? latest.position    : null,
      prevPosition: prev   ? prev.position      : null,
      impressions:  latest ? latest.impressions : null,
      clicks:       latest ? latest.clicks      : null,
      ctr:          latest ? latest.ctr         : null,
      checkedAt:    latest ? latest.checkedAt   : null,
      source:       latest ? latest.source      : null,
    };
  });
}

/** キーワード追加 */
async function addSeoKeyword(data) {
  // data: { siteId, keyword, targetUrl?, isOwn? }
  return db.seoKeyword.upsert({
    where: {
      siteId_keyword_targetUrl: {
        siteId:    data.siteId,
        keyword:   data.keyword,
        targetUrl: data.targetUrl || null,
      },
    },
    create: {
      siteId:    data.siteId,
      keyword:   data.keyword,
      targetUrl: data.targetUrl  || null,
      isOwn:     data.isOwn !== undefined ? data.isOwn : true,
      isActive:  true,
    },
    update: { isActive: true },
  });
}

/** キーワード削除（論理削除 = isActive: false） */
async function deactivateSeoKeyword(id) {
  return db.seoKeyword.update({
    where: { id },
    data:  { isActive: false },
  });
}

// -------------------------------------------------------
// 順位履歴取得
// -------------------------------------------------------

/**
 * 特定キーワードの順位推移（直近N件）
 * @param {string} keywordId
 * @param {number} limit
 */
async function getKeywordHistory(keywordId, limit) {
  limit = limit || 20;
  return db.seoRankRecord.findMany({
    where:   { keywordId },
    orderBy: { checkedAt: 'asc' },
    take:    limit,
  });
}

/**
 * 全キーワードの最新順位サマリ
 * @param {string|null} siteId
 */
async function getRankSummary(siteId) {
  return listSeoKeywords(siteId);
}

module.exports = {
  listSeoKeywords,
  addSeoKeyword,
  deactivateSeoKeyword,
  getKeywordHistory,
  getRankSummary,
};
