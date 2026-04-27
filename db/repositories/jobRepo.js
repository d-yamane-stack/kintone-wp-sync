'use strict';

const { getPrismaClient } = require('../client');

/**
 * ジョブ開始時に呼ぶ。running ステータスで INSERT。
 * @param {object} params
 * @param {string} params.siteId   - siteConfigs の siteId（例: "jube"）
 * @param {string} params.jobType  - "case_study" | "column"
 * @param {object} [params.meta]   - ジョブ固有パラメータ
 * @returns {object} 作成されたジョブレコード
 */
async function createJob(params) {
  const db = getPrismaClient();
  // Site レコードがなければ自動作成（外部キー制約対策）
  const siteData = {
    siteName:      params.siteName     || params.siteId,
    wpBaseUrl:     params.wpBaseUrl    || '',
    wpUsername:    params.wpUsername   || '',
    wpAppPassword: params.wpAppPassword|| '',
    wpPostType:    params.wpPostType   || 'post',
  };
  await db.site.upsert({
    where:  { siteId: params.siteId },
    update: siteData,
    create: { siteId: params.siteId, ...siteData },
  });
  return db.contentJob.create({
    data: {
      siteId:  params.siteId,
      jobType: params.jobType,
      status:  'running',
      meta:    params.meta || {},
    },
  });
}

/**
 * ジョブ完了時に呼ぶ。
 * @param {string} jobId
 * @param {'done'|'error'} status
 * @param {string} [errorMessage]
 */
async function finishJob(jobId, status, errorMessage) {
  const db = getPrismaClient();
  return db.contentJob.update({
    where: { id: jobId },
    data: {
      status:       status,
      finishedAt:   new Date(),
      errorMessage: errorMessage || null,
    },
  });
}

/**
 * 最近のジョブ一覧を取得する（管理UIや確認用）。
 * @param {number} [limit=20]
 */
async function listRecentJobs(limit) {
  const db = getPrismaClient();
  return db.contentJob.findMany({
    take:    limit || 20,
    orderBy: { startedAt: 'desc' },
    include: { _count: { select: { contentItems: true } } },
  });
}

module.exports = { createJob, finishJob, listRecentJobs };
