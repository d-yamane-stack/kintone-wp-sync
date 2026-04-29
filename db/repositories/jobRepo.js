'use strict';

const { getPrismaClient } = require('../client');

/**
 * ジョブ登録。pending ステータスで INSERT。
 * worker.js がポーリングで拾って running に更新する。
 */
async function createJob(params) {
  const db = getPrismaClient();
  const siteData = {
    siteName:      params.siteName      || params.siteId,
    wpBaseUrl:     params.wpBaseUrl     || '',
    wpUsername:    params.wpUsername    || '',
    wpAppPassword: params.wpAppPassword || '',
    wpPostType:    params.wpPostType    || 'post',
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
      status:  'pending',          // ← running から pending に変更
      meta:    params.meta || {},
    },
  });
}

/**
 * 最古の pending ジョブを1件取得し、running に遷移させて返す。
 * 競合した場合は null を返す（単一workerなのでほぼ発生しない）。
 */
async function pickPendingJob() {
  const db = getPrismaClient();
  const job = await db.contentJob.findFirst({
    where:   { status: 'pending', deletedAt: null },
    orderBy: { startedAt: 'asc' },
  });
  if (!job) return null;

  // 楽観的ロック: 他のプロセスが先に拾っていたら count=0
  const result = await db.contentJob.updateMany({
    where: { id: job.id, status: 'pending' },
    data:  { status: 'running' },
  });
  if (result.count === 0) return null;

  return db.contentJob.findUnique({ where: { id: job.id } });
}

/**
 * ジョブ完了時に呼ぶ。
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
 * 最近のジョブ一覧（ダッシュボード用）。
 * contentItems + postResult を含む。削除済みは除外。
 */
async function listRecentJobs(limit) {
  const db = getPrismaClient();
  return db.contentJob.findMany({
    where:   { deletedAt: null },
    take:    limit || 20,
    orderBy: { startedAt: 'desc' },
    include: {
      contentItems: {
        include: { postResult: true },
      },
    },
  });
}

module.exports = { createJob, pickPendingJob, finishJob, listRecentJobs };
