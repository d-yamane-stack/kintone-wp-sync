'use strict';

const { getSiteConfig }   = require('../sites/siteConfigs');
const { getPrismaClient } = require('../db/client');
const { findColumnIdByUrl, updateColumnPost, uploadColumnImageBuffer } = require('../publishers/wordpress');
const { createColumnImage } = require('../media/generateColumnImage');
const { injectInlineImage } = require('../webapp/lib/rewriteHtml');

/**
 * コラム画像ルールに沿った「タイトル入り画像」を生成してWPにアップし {id, sourceUrl} を返す。
 *
 * リライトでは既存アイキャッチを土台に「しない」。既存アイキャッチは旧タイトルが焼き込まれた
 * タイトル画像であり、それに新タイトルを重ね書きすると新旧タイトルが二重表示になるため、
 * 必ず Pexels から新しい写真を取得してタイトルを合成する（＝コラム生成と同じ createColumnImage）。
 */
async function buildRewriteTitleImage(siteConfig, postType, postId, title, keyword) {
  try {
    const imgBuffer = await createColumnImage(title, keyword || title, siteConfig.siteId);
    if (!imgBuffer) {
      console.warn('[Rewrite] タイトル画像を生成できませんでした（PEXELS_API_KEY未設定/写真取得失敗）');
      return null;
    }
    const slug = 'rewrite-' + postId + '-' + Date.now() + '.jpg';
    const up = await uploadColumnImageBuffer(imgBuffer, slug, siteConfig);
    if (up && up.id) {
      console.log('[Rewrite] 新規タイトル画像をアップロード: ID ' + up.id);
      return up;
    }
  } catch (e) {
    console.warn('[Rewrite] タイトル画像の生成/アップロードをスキップ: ' + e.message);
  }
  return null;
}

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

  // コラム画像ルール: タイトル入り画像を生成 → 本文（吹き出し直下）に幅いっぱいで挿入＋アイキャッチに設定
  const colImg = await buildRewriteTitleImage(siteConfig, postType, postId, title, meta.category || title);
  let finalHtml = html;
  let featuredMedia;
  if (colImg && colImg.id && colImg.sourceUrl) {
    finalHtml     = injectInlineImage(html, colImg.id, colImg.sourceUrl, title);
    featuredMedia = colImg.id;
    await prisma.contentItem.update({ where: { id: item.id }, data: { generatedBody: finalHtml } }).catch(function () {});
    console.log('[Rewrite] 本文にタイトル入り画像を挿入＋アイキャッチ設定 (media ' + colImg.id + ')');
  }

  // 既存記事を上書き＋公開（タイトル入り画像をアイキャッチにも設定）
  const result = await updateColumnPost(siteConfig, postId, { title: title, content: finalHtml, featuredMedia: featuredMedia }, 'publish', postType);

  // 投稿結果を記録（履歴一覧に「公開済み」を表示）
  const editUrl = (siteConfig.wordpress.adminBase || '') + 'post.php?post=' + postId + '&action=edit';
  await prisma.postResult.upsert({
    where:  { contentItemId: item.id },
    // 再実行（画像の作り直し等）では公開日を上書きしない＝初回リライト日を保持する
    update: { wpPostId: postId, wpUrl: result.link || meta.url || '', wpEditUrl: editUrl, postStatus: 'publish' },
    create: { contentItemId: item.id, wpPostId: postId, wpUrl: result.link || meta.url || '', wpEditUrl: editUrl, postStatus: 'publish', wpPublishedAt: new Date() },
  }).catch(function(e) { console.warn('[Rewrite] PostResult記録失敗: ' + e.message); });

  await prisma.contentItem.update({ where: { id: item.id }, data: { status: 'posted' } }).catch(function() {});

  console.log('[Rewrite] 完了: ' + (result.link || ('id ' + postId)));
  return { wpPostId: postId, wpUrl: result.link, status: result.status };
}

module.exports = { runRewritePostPipeline };
