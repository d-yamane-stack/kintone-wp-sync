'use strict';

const { getSiteConfig }   = require('../sites/siteConfigs');
const { getPrismaClient } = require('../db/client');
const { findColumnIdByUrl, updateColumnPost } = require('../publishers/wordpress');

/**
 * リライト本文で既存コラム記事を上書き更新（＋公開）するパイプライン。
 * meta: { siteId, url, wpPostId?, newTitle? }
 * 本文・タイトルは jobId に紐づく content_item（generatedBody / generatedTitle）から取得する。
 * WP書き込みは国内IPのローカルworkerで実行（XSERVER等の海外IPブロック回避）。
 */
async function runRewritePostPipeline(meta, jobId) {
  const prisma     = getPrismaClient();
  const siteConfig = getSiteConfig(meta.siteId);
  const postType   = (siteConfig.columnConfig && siteConfig.columnConfig.postType) || 'column';

  // 生成済み本文（content_item）を取得
  const item = await prisma.contentItem.findFirst({
    where:   { jobId: jobId },
    orderBy: { createdAt: 'desc' },
  });
  if (!item || !item.generatedBody) {
    throw new Error('リライト本文が見つかりません（jobId=' + jobId + '）');
  }
  const title = item.generatedTitle || meta.newTitle || '';
  const html  = item.generatedBody;

  // 対象記事のWP記事IDを解決（DB由来=保存済みID、サイトマップ由来=URLから照合）
  let postId = meta.wpPostId ? parseInt(meta.wpPostId, 10) : null;
  if (!postId) {
    postId = await findColumnIdByUrl(siteConfig, meta.url, postType);
  }
  if (!postId) {
    throw new Error('対象記事のWP記事IDを特定できませんでした（URL: ' + (meta.url || '不明') + '）');
  }

  console.log('[Rewrite] 記事更新: site=' + meta.siteId + ' type=' + postType + ' id=' + postId + ' / ' + title);

  // 既存記事を上書き＋公開
  const result = await updateColumnPost(siteConfig, postId, { title: title, content: html }, 'publish', postType);

  // 投稿結果を記録（履歴一覧に「公開済み」を表示）
  const editUrl = (siteConfig.wordpress.adminBase || '') + 'post.php?post=' + postId + '&action=edit';
  await prisma.postResult.upsert({
    where:  { contentItemId: item.id },
    update: { wpPostId: postId, wpUrl: result.link || meta.url || '', wpEditUrl: editUrl, postStatus: 'publish', wpPublishedAt: new Date() },
    create: { contentItemId: item.id, wpPostId: postId, wpUrl: result.link || meta.url || '', wpEditUrl: editUrl, postStatus: 'publish', wpPublishedAt: new Date() },
  }).catch(function(e) { console.warn('[Rewrite] PostResult記録失敗: ' + e.message); });

  await prisma.contentItem.update({ where: { id: item.id }, data: { status: 'posted' } }).catch(function() {});

  console.log('[Rewrite] 完了: ' + (result.link || ('id ' + postId)));
  return { wpPostId: postId, wpUrl: result.link, status: result.status };
}

module.exports = { runRewritePostPipeline };
