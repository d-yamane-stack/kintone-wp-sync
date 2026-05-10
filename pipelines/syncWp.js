'use strict';

const { getPrismaClient } = require('../db/client');
const { getSiteConfig }   = require('../sites/siteConfigs');

/**
 * DB上の全ジョブのWordPressステータスを同期する。
 *
 * XSERVER のセキュリティルール対策:
 * 1. /wp-json/wp/v2/{type}?include=id1,id2,... の **listエンドポイント** で
 *    複数ポストを一括取得（単一リソース /wp/v2/{type}/{id} は SiteGuard 等が
 *    Authorization ヘッダー付きで叩くと 403 を返すケースが頻発するため）
 * 2. 認証なしで列挙 → 公開済み記事はそれだけで取得可能
 * 3. 認証なしで取得できなかった ID（＝下書き）のみ、認証付きで再試行
 */

const BATCH_SIZE = 50; // include= で渡せる ID 数の安全な上限

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** WP REST list エンドポイントから複数ポストを一括取得 */
async function fetchPostsByIds(baseUrl, restBase, ids, auth) {
  if (ids.length === 0) return { byId: {}, missingIds: [], httpStatus: 200, errBody: '' };

  // XServer SiteGuard は status=any + Authorization の組み合わせを 403 で弾く。
  // 公開済み記事は auth なしでも取得できるので、status パラメータは常に省略する。
  // （下書きは取得できないが、ユーザーの主な問題は「公開済みなのに下書き表示」のため許容）
  const url = baseUrl + '/wp-json/wp/v2/' + restBase
    + '?include=' + ids.join(',')
    + '&per_page=' + ids.length
    + '&_fields=id,status,date';

  const headers = { 'Accept': 'application/json' };
  if (auth) headers['Authorization'] = auth;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { byId: {}, missingIds: ids, httpStatus: res.status, errBody: errBody.slice(0, 200) };
  }

  const arr = await res.json();
  const byId = {};
  if (Array.isArray(arr)) {
    arr.forEach(p => { if (p?.id) byId[String(p.id)] = p; });
  }
  const missingIds = ids.filter(id => !byId[String(id)]);
  return { byId, missingIds, httpStatus: 200, errBody: '' };
}

async function runSyncWpPipeline() {
  const db = getPrismaClient();

  const jobs = await db.contentJob.findMany({
    where:   { deletedAt: null },
    include: {
      contentItems: {
        include: { postResult: true },
        where:   { postResult: { isNot: null } },
      },
    },
  });

  let updated         = 0;
  let skippedNoId     = 0;  // wpPostId が null → WP投稿未完了
  let skippedNoChange = 0;  // ステータス変化なし
  let skippedCreds    = 0;  // credentials 未設定
  let skippedNotFound = 0;  // WP の公開一覧に出てこない（下書き継続 or 削除済み）
  let errors          = 0;
  const errorDetails  = [];

  // ─── 1. siteId × postType ごとにアイテムをグループ化 ──────────────
  const groups = {}; // key = siteId|restBase → { creds, items: [{pr, item, jobId}] }

  for (const job of jobs) {
    let creds;
    try {
      const sc = getSiteConfig(job.siteId);
      creds = {
        wpBaseUrl:     sc.wordpress.baseUrl,
        wpUsername:    sc.wordpress.username,
        wpAppPassword: sc.wordpress.appPassword,
        wpPostType:    sc.wordpress.postType,
      };
    } catch (e) {
      console.warn('[SyncWP] siteConfig not found: siteId=' + job.siteId);
      skippedCreds++;
      continue;
    }
    if (!creds.wpBaseUrl || !creds.wpUsername || !creds.wpAppPassword) {
      console.warn('[SyncWP] credentials missing: siteId=' + job.siteId);
      skippedCreds++;
      continue;
    }

    const restBase = job.jobType === 'column' ? 'column' : creds.wpPostType;
    const key = job.siteId + '|' + restBase;
    if (!groups[key]) groups[key] = { creds, restBase, items: [] };

    for (const item of job.contentItems) {
      const pr = item.postResult;
      if (!pr || !pr.wpPostId) {
        console.log('[SyncWP] wpPostId未設定: jobId=' + job.id + ' title=' + (item.generatedTitle || '').slice(0, 40));
        skippedNoId++;
        continue;
      }
      groups[key].items.push({ pr, item, jobId: job.id });
    }
  }

  // ─── 2. グループごとに一括取得＋差分更新 ─────────────────────────
  for (const key of Object.keys(groups)) {
    const { creds, restBase, items } = groups[key];
    const baseUrl = creds.wpBaseUrl.replace(/\/$/, '');
    const auth    = 'Basic ' + Buffer.from(creds.wpUsername + ':' + creds.wpAppPassword).toString('base64');

    const allIds = items.map(({ pr }) => pr.wpPostId);
    const idChunks = chunk(allIds, BATCH_SIZE);

    // 一括取得結果の統合
    const aggregateById = {};

    for (const chunkIds of idChunks) {
      // ① 認証なしで取得（公開済みのみ返る・XServer security に引っかからない）
      const noAuth = await fetchPostsByIds(baseUrl, restBase, chunkIds, null);
      Object.assign(aggregateById, noAuth.byId);

      // ② 認証なしの list エンドポイント自体が失敗 → auth付きで再試行（status=any は付けない）
      if (noAuth.httpStatus !== 200) {
        errorDetails.push('HTTP ' + noAuth.httpStatus + ' (no-auth取得失敗) ids=' + chunkIds.slice(0, 3).join(','));
        console.log('[SyncWP] no-auth取得失敗: HTTP ' + noAuth.httpStatus + ' body=' + noAuth.errBody);

        const withAuth = await fetchPostsByIds(baseUrl, restBase, chunkIds, auth);
        Object.assign(aggregateById, withAuth.byId);
        if (withAuth.httpStatus !== 200) {
          errorDetails.push('HTTP ' + withAuth.httpStatus + ' (auth付きでも失敗) ids=' + chunkIds.slice(0, 3).join(','));
          console.log('[SyncWP] auth付きでも失敗: HTTP ' + withAuth.httpStatus + ' body=' + withAuth.errBody);
        }
        continue;
      }

      // ③ list 取得は成功したが特定IDが応答に含まれない
      //    → 下書きのまま or 削除済み。判別不能なので更新スキップ（既存ステータスを維持）。
      //    エラー扱いにはしない（公開済みのみ追従できれば十分というユーザー要件）。
      if (noAuth.missingIds.length > 0) {
        console.log('[SyncWP] 公開状態で未検出（下書き継続 or 削除済みの可能性） ids=' +
          noAuth.missingIds.slice(0, 5).join(',') +
          (noAuth.missingIds.length > 5 ? ' ...他' + (noAuth.missingIds.length - 5) + '件' : ''));
      }
    }

    // ③ 各アイテムを更新
    for (const { pr } of items) {
      const wpData = aggregateById[String(pr.wpPostId)];
      if (!wpData) {
        // 公開リストに出てこない → 下書き継続 or 削除済み（区別不能）
        // 既存DBステータスを維持してスキップ（エラーにしない）
        skippedNotFound++;
        continue;
      }

      const newStatus = wpData.status || pr.postStatus;
      const newDate   = (newStatus === 'publish' || newStatus === 'future')
        ? (wpData.date ? new Date(wpData.date) : null)
        : null;

      const statusChanged = newStatus !== pr.postStatus;
      const dateChanged   = (newDate ? newDate.toISOString() : null) !==
                            (pr.wpPublishedAt ? pr.wpPublishedAt.toISOString() : null);

      if (statusChanged || dateChanged) {
        try {
          await db.postResult.update({
            where: { id: pr.id },
            data:  { postStatus: newStatus, wpPublishedAt: newDate },
          });
          updated++;
          console.log('[SyncWP] 更新: wpPostId=' + pr.wpPostId +
            ' ' + pr.postStatus + ' → ' + newStatus);
        } catch (e) {
          console.error('[SyncWP] DB更新失敗 wpPostId=' + pr.wpPostId + ' ' + e.message);
          errorDetails.push('DB更新失敗: ' + e.message.slice(0, 60));
          errors++;
        }
      } else {
        skippedNoChange++;
      }
    }
  }

  const skipped = skippedNoId + skippedNoChange + skippedCreds + skippedNotFound;
  console.log('[SyncWP] 完了 updated=' + updated +
    ' skippedNoId=' + skippedNoId +
    ' skippedNoChange=' + skippedNoChange +
    ' skippedCreds=' + skippedCreds +
    ' skippedNotFound=' + skippedNotFound +
    ' errors=' + errors);
  return { updated, skipped, skippedNoId, skippedNoChange, skippedCreds, skippedNotFound, errors, errorDetails };
}

module.exports = { runSyncWpPipeline };
