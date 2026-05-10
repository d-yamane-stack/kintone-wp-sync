'use strict';

const { getPrismaClient } = require('../db/client');
const { getSiteConfig }   = require('../sites/siteConfigs');

/**
 * DB上の全ジョブのWordPressステータスを同期する。
 *
 * XSERVER のサーバーレベル WAF 対策:
 *   ?include=12345,12346,... というカンマ区切り数値クエリを SQL 系シグネチャで
 *   弾くため、include は使わない。代わりに標準的な
 *   ?per_page=100&page=N のページネーション形式で公開記事を全件取得し、
 *   ローカルで wpPostId をマッチさせる（WAFを刺激しない最も一般的な
 *   公開リスティングパターン）。
 *
 *   下書きは公開リストに出ないため取得不能。ユーザーの主問題は
 *   「公開済みなのにDBが下書きのまま」のため、公開済みのみ追従できれば十分。
 */

const PER_PAGE  = 100;  // WP REST の最大値
const MAX_PAGES = 20;   // 安全側のリミット（最大2000件）

// XServer SiteGuard / WAF はデフォルトの Node.js User-Agent を弾くことがあるため、
// ブラウザ風の UA をそのまま付ける。
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** HTML 本文 + ヘッダから WAF / セキュリティプラグインを推定 */
function detectBlocker(body, resHeaders) {
  const b = (body || '').toLowerCase();
  const server = (resHeaders?.get?.('server') || '').toLowerCase();
  const xPowered = (resHeaders?.get?.('x-powered-by') || '').toLowerCase();
  const xSucuri = resHeaders?.get?.('x-sucuri-id') || '';
  const cfRay = resHeaders?.get?.('cf-ray') || '';

  if (cfRay || b.includes('cloudflare') || b.includes('attention required')) return 'Cloudflare';
  if (xSucuri || b.includes('sucuri')) return 'Sucuri';
  if (b.includes('siteguard')) return 'SiteGuard';
  if (b.includes('wordfence')) return 'Wordfence';
  if (b.includes('imunify')) return 'Imunify';
  if (b.includes('mod_security') || b.includes('modsecurity')) return 'ModSecurity';
  if (b.includes('xserver') || b.includes('x-server') || server.includes('xserver')) return 'XSERVER';
  if (b.includes('forbidden') && b.includes('access')) return 'Generic 403';
  if (xPowered) return 'PoweredBy:' + xPowered.slice(0, 30);
  if (server) return 'Server:' + server.slice(0, 30);
  return 'Unknown';
}

/** 共通リクエストヘッダ */
function buildHeaders(auth) {
  const h = {
    'Accept':          'application/json',
    'User-Agent':      BROWSER_UA,
    'Accept-Language': 'ja,en;q=0.9',
  };
  if (auth) h['Authorization'] = auth;
  return h;
}

/**
 * WP REST のページネーションで公開記事を全件取得。
 *
 * needIds が与えられている場合、ID 降順で取得しつつ「全 needIds が見つかった or
 * 現ページの最小 ID が needIds の最小値を下回った」時点で打ち切る（早期終了）。
 *
 * 戻り値: { byId, totalFetched, lastError }
 */
async function fetchAllPostsPaginated(baseUrl, restBase, auth, needIds) {
  const byId = {};
  const needSet = new Set(needIds.map(String));
  const minNeed = needIds.length > 0 ? Math.min(...needIds) : 0;
  let totalFetched = 0;
  let lastError = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    // ID 降順 + _fields 限定 + 公開済みのみ。標準的な公開リスティングパターン。
    const url = baseUrl + '/wp-json/wp/v2/' + restBase
      + '?per_page=' + PER_PAGE
      + '&page='     + page
      + '&orderby=id&order=desc'
      + '&_fields=id,status,date';

    let res;
    try {
      res = await fetch(url, { headers: buildHeaders(auth) });
    } catch (e) {
      lastError = { status: 0, blocker: 'NetworkError', body: e.message };
      break;
    }

    if (!res.ok) {
      // page > 総ページ数で 400 を返すのは WP の仕様 → 正常終了
      if (res.status === 400 && page > 1) break;
      const body = await res.text().catch(() => '');
      lastError = {
        status:  res.status,
        blocker: detectBlocker(body, res.headers),
        body:    body.slice(0, 300),
      };
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

    // 早期終了: 必要 ID が全て見つかった or ページ最小 ID が必要 ID の最小値より小さい
    const allFound = needIds.every(id => byId[String(id)]);
    if (allFound) break;
    if (minIdOnPage < minNeed) break;

    // 最終ページ
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

    // ① 認証なしでページネーション取得（公開記事のみ・WAFを刺激しない標準パターン）
    let result = await fetchAllPostsPaginated(baseUrl, restBase, null, allIds);
    let aggregateById = result.byId;

    // ② 認証なしが WAF/サーバーレベルで失敗した場合のみ auth でリトライ
    if (result.lastError && result.totalFetched === 0) {
      const e = result.lastError;
      errorDetails.push('HTTP ' + e.status + ' [' + e.blocker + '] no-auth');
      console.log('[SyncWP] no-auth ページ取得失敗: HTTP ' + e.status +
        ' blocker=' + e.blocker + ' body=' + e.body);

      const retry = await fetchAllPostsPaginated(baseUrl, restBase, auth, allIds);
      aggregateById = retry.byId;
      if (retry.lastError && retry.totalFetched === 0) {
        const re = retry.lastError;
        errorDetails.push('HTTP ' + re.status + ' [' + re.blocker + '] auth');
        console.log('[SyncWP] auth ページ取得も失敗: HTTP ' + re.status +
          ' blocker=' + re.blocker + ' body=' + re.body);
      }
    }

    console.log('[SyncWP] ' + key + ' 取得済み=' + Object.keys(aggregateById).length +
      '件 / 必要=' + allIds.length + '件');

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
  // 同じメッセージが複数チャンクから出るので重複排除
  const dedupedDetails = Array.from(new Set(errorDetails));
  return { updated, skipped, skippedNoId, skippedNoChange, skippedCreds, skippedNotFound, errors, errorDetails: dedupedDetails };
}

module.exports = { runSyncWpPipeline };
