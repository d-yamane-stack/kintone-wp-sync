'use strict';

/**
 * SEO順位チェックパイプライン（Serper.dev 一本化）
 *
 * - 自サイト・競合サイト、すべて Serper.dev で現在順位を取得
 * - 1回の Serper 検索で自サイト＋全競合の順位を同時取得
 * - 取得ログ(seo_fetch_logs)に実行結果を記録
 * - サイト別アラート閾値(seo_site_configs)を参照
 * - Serperエラー時は最大3回リトライ
 *
 * 呼び出し: runSeoRankPipeline({ siteId?, keywordIds?, sendReport? })
 */

require('dotenv').config({ override: true });

const { httpRequest }             = require('../lib/http');
const { getPrismaClient }         = require('../db/client');
const db                          = getPrismaClient();
const { sendMail, sendRankAlert } = require('../lib/notify');
const { generateSeoReportPdf }    = require('../lib/pdfReport');

const OWN_DOMAINS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};

const DEFAULT_ALERT_THRESHOLD = 5;
const SERPER_RETRY_MAX        = 3;
const SERPER_RETRY_DELAY_MS   = 2000;

// -------------------------------------------------------
// Serper.dev 検索（リトライ付き）
// -------------------------------------------------------
async function fetchSerperResults(keyword) {
  for (var attempt = 1; attempt <= SERPER_RETRY_MAX; attempt++) {
    try {
      const resp = await httpRequest({
        url:    'https://google.serper.dev/search',
        method: 'POST',
        headers: {
          'X-API-KEY':    process.env.SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
      }, {
        q:   keyword,
        gl:  'jp',
        hl:  'ja',
        num: 20,
      });
      return (resp && resp.organic) || [];
    } catch (err) {
      console.error('[SeoRank] Serperエラー attempt=' + attempt + ' keyword=' + keyword + ': ' + err.message);
      if (attempt < SERPER_RETRY_MAX) {
        await new Promise(function(r) { setTimeout(r, SERPER_RETRY_DELAY_MS * attempt); });
      }
    }
  }
  return [];
}

// ドメインが結果に含まれているか探して順位を返す
function extractPosition(organic, domain) {
  const norm = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  for (var i = 0; i < organic.length; i++) {
    var link = (organic[i].link || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (link === norm || link.startsWith(norm + '/')) {
      return organic[i].position;
    }
  }
  return null;
}

// サイト別アラート閾値を取得（設定なければデフォルト）
async function getAlertThreshold(siteId) {
  try {
    const config = await db.seoSiteConfig.findUnique({ where: { siteId } });
    return config ? config.alertThreshold : DEFAULT_ALERT_THRESHOLD;
  } catch (_) {
    return DEFAULT_ALERT_THRESHOLD;
  }
}

// サイト別アラートメール先を取得
async function getAlertEmail(siteId) {
  try {
    const config = await db.seoSiteConfig.findUnique({ where: { siteId } });
    return (config && config.alertEmail) ? config.alertEmail : null;
  } catch (_) {
    return null;
  }
}

// -------------------------------------------------------
// メインパイプライン
// -------------------------------------------------------
async function runSeoRankPipeline(opts, jobId) {
  opts = opts || {};
  const siteIdFilter    = opts.siteId     || null;
  const keywordIdFilter = opts.keywordIds || null;
  const sendReport      = opts.sendReport !== false;

  console.log('[SeoRank] 開始 siteId=' + (siteIdFilter || 'all'));

  // 取得ログ作成（running）
  let fetchLogId = null;
  try {
    const log = await db.seoFetchLog.create({
      data: {
        siteId:    siteIdFilter || 'all',
        status:    'running',
        startedAt: new Date(),
      },
    });
    fetchLogId = log.id;
  } catch (e) {
    console.error('[SeoRank] ログ作成エラー: ' + e.message);
  }

  async function updateLog(status, count, error) {
    if (!fetchLogId) return;
    try {
      await db.seoFetchLog.update({
        where: { id: fetchLogId },
        data: {
          status,
          count:      count  || null,
          error:      error  || null,
          finishedAt: new Date(),
        },
      });
    } catch (e) {
      console.error('[SeoRank] ログ更新エラー: ' + e.message);
    }
  }

  // キーワード取得
  const kwWhere = { isActive: true };
  if (siteIdFilter)    kwWhere.siteId = siteIdFilter;
  if (keywordIdFilter) kwWhere.id     = { in: keywordIdFilter };

  const keywords = await db.seoKeyword.findMany({ where: kwWhere });
  console.log('[SeoRank] 対象キーワード: ' + keywords.length + ' 件');

  if (keywords.length === 0) {
    console.log('[SeoRank] キーワードなし → スキップ');
    await updateLog('success', 0, null);
    return;
  }

  // 競合ドメイン取得（サイトIDごと）
  const competitorMap = {};
  const allCompetitors = await db.seoCompetitor.findMany({ where: { isActive: true } });
  allCompetitors.forEach(function(c) {
    if (!competitorMap[c.siteId]) competitorMap[c.siteId] = [];
    competitorMap[c.siteId].push(c);
  });

  // サイト別アラート閾値をキャッシュ
  const thresholdCache = {};
  async function threshold(siteId) {
    if (thresholdCache[siteId] == null) {
      thresholdCache[siteId] = await getAlertThreshold(siteId);
    }
    return thresholdCache[siteId];
  }

  const alerts  = [];
  const allRows = [];

  try {
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      var ownDomain   = OWN_DOMAINS[kw.siteId] || kw.siteId;
      var competitors = competitorMap[kw.siteId] || [];

      console.log('[SeoRank] 検索: "' + kw.keyword + '" siteId=' + kw.siteId);

      var organic = await fetchSerperResults(kw.keyword);
      console.log('[SeoRank] 検索結果: ' + organic.length + '件');

      var checkedAt = new Date();

      // 前回の自サイト順位（アラート判定用）
      var prevOwnRecord = await db.seoRankRecord.findFirst({
        where:   { keywordId: kw.id, isOwn: true },
        orderBy: { checkedAt: 'desc' },
      });
      var prevOwnPosition = prevOwnRecord ? prevOwnRecord.position : null;

      // SERP Top10 保存
      var serpData = [];
      for (var s = 0; s < Math.min(organic.length, 10); s++) {
        var item = organic[s];
        var itemUrl    = item.link || '';
        var itemDomain = itemUrl.replace(/^https?:\/\//, '').split('/')[0];
        serpData.push({
          keywordId: kw.id,
          checkedAt: checkedAt,
          position:  item.position || (s + 1),
          url:       itemUrl,
          title:     (item.title || '').substring(0, 200),
          domain:    itemDomain,
        });
      }
      if (serpData.length > 0) {
        await db.seoSerpEntry.createMany({ data: serpData });
      }

      // 順位抽出
      var ownPosition = extractPosition(organic, ownDomain);
      console.log('[SeoRank] 自サイト(' + ownDomain + '): ' + (ownPosition != null ? ownPosition + '位' : '圏外'));

      // アラート判定（サイト別閾値）
      if (prevOwnPosition != null && ownPosition != null) {
        var diff = ownPosition - prevOwnPosition;
        var th   = await threshold(kw.siteId);
        if (Math.abs(diff) >= th) {
          alerts.push({
            keyword:      kw.keyword,
            siteId:       kw.siteId,
            prevPosition: prevOwnPosition,
            newPosition:  ownPosition,
          });
        }
      }

      allRows.push({
        keyword:      kw.keyword,
        category:     kw.category,
        siteId:       kw.siteId,
        domain:       ownDomain,
        isOwn:        true,
        position:     ownPosition,
        prevPosition: prevOwnPosition,
      });

      // 競合順位を抽出
      var batchRecords = [
        { keywordId: kw.id, checkedAt: checkedAt, domain: ownDomain, isOwn: true, position: ownPosition },
      ];
      for (var j = 0; j < competitors.length; j++) {
        var comp         = competitors[j];
        var compPosition = extractPosition(organic, comp.domain);
        console.log('[SeoRank] 競合(' + comp.domain + '): ' + (compPosition != null ? compPosition + '位' : '圏外'));
        batchRecords.push({ keywordId: kw.id, checkedAt: checkedAt, domain: comp.domain, isOwn: false, position: compPosition });
        allRows.push({ keyword: kw.keyword, siteId: kw.siteId, domain: comp.domain, isOwn: false, position: compPosition });
      }

      // 1キーワード分をまとめてバッチ挿入（接続数削減）
      await db.seoRankRecord.createMany({ data: batchRecords });

      // Serper rate limit 対策
      if (i < keywords.length - 1) {
        await new Promise(function(r) { setTimeout(r, 1000); });
      }
    }

    console.log('[SeoRank] 完了 alerts=' + alerts.length);
    await updateLog('success', keywords.length, null);

  } catch (e) {
    console.error('[SeoRank] パイプラインエラー: ' + e.message);
    await updateLog('error', null, e.message);
    throw e;
  }

  // アラートメール（サイト別送信先）
  if (alerts.length > 0) {
    // サイト別にグループ化して送信
    const bysite = {};
    alerts.forEach(function(a) {
      if (!bysite[a.siteId]) bysite[a.siteId] = [];
      bysite[a.siteId].push(a);
    });
    for (var sid in bysite) {
      const toEmail = await getAlertEmail(sid);
      await sendRankAlert(bysite[sid], toEmail).catch(function(e) {
        console.error('[SeoRank] アラートメールエラー: ' + e.message);
      });
    }
  }

  // 定期レポートPDF送信
  if (sendReport) {
    try {
      const pdfBuf = await generateSeoReportPdf({
        title:       'SEO順位レポート',
        generatedAt: new Date(),
        rows:        allRows,
        competitors: allCompetitors,
      });

      const dateStr = new Date().toLocaleDateString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).replace(/\//g, '');

      await sendMail({
        subject:     '[SEO順位レポート] ' + dateStr,
        text:        '添付のPDFをご確認ください。',
        html:        '<p>SEO順位レポートを添付します。</p>',
        attachments: [{
          filename:    'seo_report_' + dateStr + '.pdf',
          content:     pdfBuf,
          contentType: 'application/pdf',
        }],
      });
      console.log('[SeoRank] レポートPDF送信完了');
    } catch (e) {
      console.error('[SeoRank] PDFレポートエラー: ' + e.message);
    }
  }

  return { checked: keywords.length, alerts: alerts.length };
}

module.exports = { runSeoRankPipeline };
