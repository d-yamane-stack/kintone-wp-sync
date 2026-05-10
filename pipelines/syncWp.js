'use strict';

const { getPrismaClient } = require('../db/client');
const { getSiteConfig }   = require('../sites/siteConfigs');

/**
 * DB上の全ジョブのWordPressステータスを同期する。
 *
 * XSERVER WAF 対策（最終形）:
 *   /wp-json/wp/v2/ への GET は XSERVER サーバーレベル WAF に弾かれるため完全廃止。
 *   代わりに /wp-admin/admin-ajax.php への POST を使用。
 *   functions.php に追加した rw_sync アクションがポストステータスを返す。
 *   シークレットキー（WP_SYNC_KEY）で認証。
 *
 * フォールバック:
 *   wpSyncKey 未設定のサイトは WP REST ページネーションで試みる（旧方式）。
 */

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** HTML 本文 + ヘッダから WAF / セキュリティプラグインを推定 */
function detectBlocker(body, resHeaders) {
  const b = (body || '').toLowerCase();
  const server  = (resHeaders?.get?.('server') || '').toLowerCase();
  const cfRay   = resHeaders?.get?.('cf-ray') || '';
  const xSucuri = resHeaders?.get?.('x-sucuri-id') || '';

  if (cfRay || b.includes('cloudflare') || b.includes('attention required')) return 'Cloudflare';
  if (xSucuri || b.includes('sucuri')) return 'Sucuri';
  if (b.includes('siteguard')) return 'SiteGuard';
  if (b.includes('wordfence')) return 'Wordfence';
  if (b.includes('imunify')) return 'Imunify';
  if (b.includes('mod_security') || b.includes('modsecurity')) return 'ModSecurity';
  if (b.includes('xserver') || b.includes('x-server') || server.includes('xserver')) return 'XSERVER';
  if (server) return 'Server:' + server.slice(0, 30);
  return 'Unknown';
}

/**
 * admin-ajax.php 経由でポストステータスを一括取得（/wp-json/ 不使用）。
 * functions.php に rw_sync アクション追加が必要。
 *
 * 戻り値: { byId: {id: postObject}, error: null | {status, message} }
 */
async function fetchStatusesViaAjax(baseUrl, ids, syncKey) {
  if (ids.length === 0) return { byId: {}, error: null };

  const body = 'action=rw_sync&k=' + encodeURIComponent(syncKey)
             + '&ids=' + ids.join(',');

  let res;
  try {
    res = await fetch(baseUrl + '/wp-admin/admin-ajax.php', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   BROWSER_UA,
        'Accept':       'application/json',
      },
      body,
    });
  } catch (e) {
    return { byId: {}, error: { status: 0, message: 'NetworkError: ' + e.message } };
  }

  const text = await res.text().catch(() => '');

  if (!res.ok) {
    return {
      byId:  {},
      error: { status: res.status, message: '[' + detectBlocker(text, res.headers) + '] ' + text.slice(0, 100) },
    };
  }

  let arr;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    return { byId: {}, error: { status: 200, message: 'JSON parse error: ' + text.slice(0, 100) } };
  }

  if (!Array.isArray(arr)) {
    // WP の wp_send_json_error は {success:false} を返す
    return { byId: {}, error: { status: 200, message: 'non-array: ' + text.slice(0, 100) } };
  }

  const byId = {};
  arr.forEach(p => { if (p?.id) byId[String(p.id)] = p; });
  return { byId, error: null };
}

/**
 * WP REST ページネーションで公開記事を全件取得（フォールバック用）。
 * XSERVER WAF 環境では使えない場合が多い。
 */
async function fetchAllPostsPaginated(baseUrl, restBase, needIds) {
  const PER_PAGE  = 100;
  const MAX_PAGES = 20;
  const byId      = {};
  const minNeed   = needIds.length > 0 ? Math.min(...needIds) : 0;
  let totalFetched = 0;
  let lastError    = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = baseUrl + '/wp-json/wp/v2/' + restBase
      + '?per_page=' + PER_PAGE
      + '&page=' + page
      + '&orderby=id&order=desc'
      + '&_fields=id,status,date';

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'Accept':       'application/json',
          'User-Agent':   BROWSER_UA,
          'Accept-Language': 'ja,en;q=0.9',
        },
      });
    } catch (e) {
      lastError = { status: 0, blocker: 'NetworkError', body: e.message };
      break;
    }

    if (!res.ok) {
      if (res.status === 400 && page > 1) break;
      const body = await res.text().catch(() => '');
      lastError = { status: res.status, blocker: detectBlocker(body, res.headers), body: body.slice(0, 200) };
      break;
    }

    const arr = await res.json().catch(() => []);
    if (!Array.isArray(arr) || arr.length === 0) break;

    let minIdOnPage = Infinity;
    for (const p of arr) {
      if (p?.id) {
        byId[String(p.id)] = p;
        if (p.id < minIdOnPage) minIdOnPage = p.id;
      }
    }
    totalFetched += arr.length;

    if (needIds.every(id => byId[String(id)])) break;
    if (minIdOnPage < minNeed) break;
    if (arr.length < PER_PAGE) break;
  }

  return { byId, totalFetched, lastError };
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
  let skippedNoId     = 0;
  let skippedNoChange = 0;
  let skippedCreds    = 0;
  let skippedNotFound = 0;
  let errors          = 0;
  const errorDetails  = [];

  // ─── 1. siteId × postType ごとにアイテムをグループ化 ──────────────
  const groups = {};

  for (const job of jobs) {
    let creds;
    try {
      const sc = getSiteConfig(job.siteId);
      creds = {
        wpBaseUrl:     sc.wordpress.baseUrl,
        wpUsername:    sc.wordpress.username,
        wpAppPassword: sc.wordpress.appPassword,
        wpPostType:    sc.wordpress.postType,
        wpSyncKey:     sc.wordpress.syncKey || '',
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
        skippedNoId++;
        continue;
      }
      groups[key].items.push({ pr, item, jobId: job.id });
    }
  }

  // ─── 2. グループごとに取得＋差分更新 ─────────────────────────────
  for (const key of Object.keys(groups)) {
    const { creds, restBase, items } = groups[key];
    const baseUrl  = creds.wpBaseUrl.replace(/\/$/, '');
    const syncKey  = creds.wpSyncKey;
    const allIds   = items.map(({ pr }) => pr.wpPostId);

    let aggregateById = {};

    if (syncKey) {
      // ── admin-ajax.php 経由（XSERVER WAF 回避・推奨） ──
      console.log('[SyncWP] ' + key + ' admin-ajax方式で取得開始 (ids=' + allIds.length + '件)');
      const { byId, error } = await fetchStatusesViaAjax(baseUrl, allIds, syncKey);
      aggregateById = byId;
      if (error) {
        errorDetails.push('admin-ajax エラー: ' + error.message);
        console.error('[SyncWP] admin-ajax失敗: ' + error.message);
      }
    } else {
      // ── WP REST ページネーション（フォールバック） ──
      console.log('[SyncWP] ' + key + ' WP REST方式で取得開始（syncKey未設定）');
      const result = await fetchAllPostsPaginated(baseUrl, restBase, allIds);
      aggregateById = result.byId;
      if (result.lastError && result.totalFetched === 0) {
        const e = result.lastError;
        errorDetails.push('HTTP ' + e.status + ' [' + e.blocker + '] REST取得失敗');
        console.error('[SyncWP] REST取得失敗: HTTP ' + e.status + ' blocker=' + e.blocker);
      }
    }

    console.log('[SyncWP] ' + key + ' 取得済み=' + Object.keys(aggregateById).length +
      '件 / 必要=' + allIds.length + '件');

    // ③ 各アイテムを差分更新
    for (const { pr } of items) {
      const wpData = aggregateById[String(pr.wpPostId)];
      if (!wpData) {
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
    ' skippedNoChange=' + skippedNoChange +
    ' skippedNotFound=' + skippedNotFound +
    ' errors=' + errors);
  return {
    updated, skipped,
    skippedNoId, skippedNoChange, skippedCreds, skippedNotFound,
    errors, errorDetails: Array.from(new Set(errorDetails)),
  };
}

module.exports = { runSyncWpPipeline };
