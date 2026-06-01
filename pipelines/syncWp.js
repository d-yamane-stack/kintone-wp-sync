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
 * @param {string} adminBaseUrl サブディレクトリ込みの WP 管理ベースURL
 *                              例: 'https://jube.co.jp/refresh2022'
 *                              （末尾 /wp-admin/admin-ajax.php は本関数で付与）
 * 戻り値: { byId: {id: postObject}, error: null | {status, message} }
 */
async function fetchStatusesViaAjax(adminBaseUrl, ids, syncKey) {
  if (ids.length === 0) return { byId: {}, error: null };

  const body = 'action=rw_sync&k=' + encodeURIComponent(syncKey)
             + '&ids=' + ids.join(',');

  let res;
  try {
    res = await fetch(adminBaseUrl + '/wp-admin/admin-ajax.php', {
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

  // 応答 "0"/"-1" = admin-ajax で action が未登録 or キー検証失敗のデフォルト応答。
  // 近年のWPは未登録アクションに HTTP 400 を返すため、ステータスより先に本文で判定する
  // （これを後にすると「HTTP 400 [Server:...] 0」という分かりにくいエラーになる）。
  if (text.trim() === '0' || text.trim() === '-1') {
    return { byId: {}, error: { status: res.status, message: 'admin-ajax応答=' + text.trim() + '（HTTP ' + res.status + '）→ rw_sync ハンドラ未登録 or 同期キー不一致の可能性。functions.php を確認してください' } };
  }

  if (!res.ok) {
    return {
      byId:  {},
      error: { status: res.status, message: 'HTTP ' + res.status + ' [' + detectBlocker(text, res.headers) + '] ' + text.replace(/\s+/g, ' ').slice(0, 120) },
    };
  }

  let arr;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    return { byId: {}, error: { status: 200, message: 'JSON parse失敗: ' + text.slice(0, 120) } };
  }

  if (!Array.isArray(arr)) {
    return { byId: {}, error: { status: 200, message: '配列でない応答: ' + text.slice(0, 120) } };
  }

  const byId = {};
  arr.forEach(p => { if (p?.id) byId[String(p.id)] = p; });
  return { byId, error: null };
}

/**
 * 認証付き WP REST で「指定IDのステータス」だけを取得する（include=方式）。
 * admin-ajax が使えない場合のフォールバック。
 *   - Basic認証で下書き(draft)等の全ステータスを取得できる
 *   - include= で必要IDのみ取得（全件ページングより軽量・WAFを刺激しにくい）
 *   - 削除済みIDは応答に含まれない → 呼び出し側の wp_deleted 判定がそのまま機能
 * ※ XSERVERは海外IPからの /wp-json/ をブロックするため、国内IP（ローカルworker）から
 *    実行された場合に有効。海外IP(Render等)では失敗し得る（その場合はerrorを返す）。
 *
 * @returns {{ byId: object, error: null | {status, message} }}
 *          byId は取得できた分（部分成功あり）。error は1チャンクでも失敗したら設定。
 */
async function fetchStatusesViaRestByIds(baseUrl, restBase, ids, authHeader) {
  if (ids.length === 0) return { byId: {}, error: null };
  const byId = {};
  const CHUNK = 50;
  let lastError = null;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const url = baseUrl + '/wp-json/wp/v2/' + restBase
      + '?include=' + chunk.join(',')
      + '&status=any&per_page=100&orderby=include'
      + '&_fields=id,status,date';

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'Authorization':   authHeader,
          'Accept':          'application/json',
          'User-Agent':      BROWSER_UA,
          'Accept-Language': 'ja,en;q=0.9',
        },
      });
    } catch (e) {
      lastError = { status: 0, message: 'NetworkError: ' + e.message };
      break;
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      lastError = { status: res.status, message: 'HTTP ' + res.status + ' [' + detectBlocker(text, res.headers) + '] ' + text.replace(/\s+/g, ' ').slice(0, 100) };
      break;
    }

    let arr;
    try { arr = JSON.parse(text); }
    catch { lastError = { status: 200, message: 'JSON parse失敗: ' + text.slice(0, 100) }; break; }
    if (Array.isArray(arr)) arr.forEach(p => { if (p && p.id) byId[String(p.id)] = p; });
  }

  // 取得できた分は byId で返す（部分成功時、未取得分は呼び出し側で削除判定せずスキップされる）
  return { byId, error: lastError };
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
        wpBaseUrl:      sc.wordpress.baseUrl,
        // WP がサブディレクトリインストールの場合 adminBaseUrl が異なる
        // 例: jube → https://jube.co.jp/refresh2022
        wpAdminBaseUrl: sc.wordpress.adminBaseUrl || sc.wordpress.baseUrl,
        wpUsername:     sc.wordpress.username,
        wpAppPassword:  sc.wordpress.appPassword,
        wpPostType:     sc.wordpress.postType,
        wpSyncKey:      sc.wordpress.syncKey || '',
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
    const baseUrl      = creds.wpBaseUrl.replace(/\/$/, '');
    const adminBaseUrl = creds.wpAdminBaseUrl.replace(/\/$/, '');
    const syncKey      = creds.wpSyncKey;
    const allIds       = items.map(({ pr }) => pr.wpPostId);

    let aggregateById = {};
    let fetchError    = null; // 取得自体が失敗した場合は wp_deleted 判定をスキップ

    const authHeader = 'Basic ' + Buffer.from(creds.wpUsername + ':' + creds.wpAppPassword).toString('base64');

    if (syncKey) {
      // ── ① admin-ajax.php 経由（XSERVER WAF 回避・推奨） ──
      console.log('[SyncWP] ' + key + ' admin-ajax方式で取得開始 (ids=' + allIds.length + '件) url=' + adminBaseUrl + '/wp-admin/admin-ajax.php');
      const { byId, error } = await fetchStatusesViaAjax(adminBaseUrl, allIds, syncKey);
      aggregateById = byId;
      if (error) {
        // ── ② admin-ajax失敗 → 認証付きRESTでフォールバック ──
        // rw_sync ハンドラ未登録/キー不一致でも、国内IP（ローカルworker）なら認証RESTで取得可能。
        console.warn('[SyncWP] admin-ajax失敗(' + error.message + ') → 認証REST(include=)でフォールバック');
        const rest = await fetchStatusesViaRestByIds(baseUrl, restBase, allIds, authHeader);
        if (Object.keys(rest.byId).length > 0) {
          aggregateById = rest.byId;
          fetchError = rest.error; // 部分失敗時のみ（未取得分は削除判定をスキップ）
          console.log('[SyncWP] REST fallback成功: ' + Object.keys(rest.byId).length + '件取得');
        } else {
          fetchError = error;
          errorDetails.push('admin-ajax エラー: ' + error.message +
            (rest.error ? ' / REST fallbackも失敗: ' + rest.error.message : ''));
          console.error('[SyncWP] admin-ajax失敗 + REST fallback失敗');
        }
      }
    } else {
      // ── syncKey未設定 → 認証付きREST(include=方式)で直接取得 ──
      console.log('[SyncWP] ' + key + ' 認証REST(include=)方式で取得開始（syncKey未設定）');
      const rest = await fetchStatusesViaRestByIds(baseUrl, restBase, allIds, authHeader);
      aggregateById = rest.byId;
      if (rest.error && Object.keys(rest.byId).length === 0) {
        fetchError = rest.error;
        errorDetails.push('REST取得失敗: ' + rest.error.message);
        console.error('[SyncWP] REST取得失敗: ' + rest.error.message);
      } else if (rest.error) {
        fetchError = rest.error; // 部分失敗（取得できた分は反映、未取得は削除判定スキップ）
      }
    }

    console.log('[SyncWP] ' + key + ' 取得済み=' + Object.keys(aggregateById).length +
      '件 / 必要=' + allIds.length + '件');

    // ③ 各アイテムを差分更新
    for (const { pr } of items) {
      const wpData = aggregateById[String(pr.wpPostId)];
      if (!wpData) {
        // 取得自体が失敗した場合は判定不能 → 旧来のスキップ
        if (fetchError) {
          skippedNotFound++;
          continue;
        }
        // 取得成功したのに該当IDが返ってこない = WP上で完全削除 or 復元不能
        // → wp_deleted にマークしてフロント側で非表示にする
        if (pr.postStatus !== 'wp_deleted') {
          try {
            await db.postResult.update({
              where: { id: pr.id },
              data:  { postStatus: 'wp_deleted', wpPublishedAt: null },
            });
            updated++;
            console.log('[SyncWP] 削除検出: wpPostId=' + pr.wpPostId +
              ' ' + (pr.postStatus || 'null') + ' → wp_deleted');
          } catch (e) {
            console.error('[SyncWP] wp_deleted マーク失敗 wpPostId=' + pr.wpPostId + ' ' + e.message);
            errorDetails.push('wp_deleted マーク失敗: ' + e.message.slice(0, 60));
            errors++;
          }
        } else {
          skippedNoChange++;
        }
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
