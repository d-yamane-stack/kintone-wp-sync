'use strict';

/**
 * SEO順位チェックパイプライン
 *
 * 自サイト: Google Search Console API（位置・表示回数・クリック）
 * 競合サイト: Serper.dev API（Google検索順位）
 *
 * 呼び出し: runSeoRankPipeline({ siteId?, keywordIds? })
 *   siteId     - null=全サイト | 'jube' | 'nurube'
 *   keywordIds - null=全キーワード | [id, ...]
 */

require('dotenv').config({ override: true });

const { google }    = require('googleapis');
const { httpRequest } = require('../lib/http');
const { getPrismaClient } = require('../db/client');
const db            = getPrismaClient();
const { sendMail, sendRankAlert } = require('../lib/notify');
const { generateSeoReportPdf }    = require('../lib/pdfReport');

// -------------------------------------------------------
// GSC クライアント生成
// -------------------------------------------------------
function getGscClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GSC_CLIENT_ID,
    process.env.GSC_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GSC_REFRESH_TOKEN,
  });
  return google.webmasters({ version: 'v3', auth: oauth2Client });
}

// GSCサイトURLマップ
const GSC_SITE_URLS = {
  jube:   process.env.GSC_SITE_URL_JUBE   || 'https://jube.co.jp/',
  nurube: process.env.GSC_SITE_URL_NURUBE || 'https://nuribe.jp/',
};

// -------------------------------------------------------
// 日付ユーティリティ
// -------------------------------------------------------
function toDateStr(date) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDatesRange(daysAgo) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  return { startDate: toDateStr(start), endDate: toDateStr(end) };
}

// -------------------------------------------------------
// GSCから自サイト順位を取得
// -------------------------------------------------------
async function fetchGscRank(siteId, keyword) {
  try {
    const gsc      = getGscClient();
    const siteUrl  = GSC_SITE_URLS[siteId];
    if (!siteUrl) {
      console.warn('[SeoRank] GSCサイトURL未設定: ' + siteId);
      return null;
    }

    const { startDate, endDate } = getDatesRange(28); // 直近28日

    const res = await gsc.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate:  startDate,
        endDate:    endDate,
        dimensions: ['query'],
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'query',
            operator:  'equals',
            expression: keyword,
          }],
        }],
        rowLimit: 1,
      },
    });

    const rows = (res.data && res.data.rows) || [];
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      position:    row.position    || null,
      impressions: row.impressions || 0,
      clicks:      row.clicks      || 0,
      ctr:         row.ctr         || 0,
    };
  } catch (err) {
    console.error('[SeoRank] GSCエラー keyword=' + keyword + ': ' + err.message);
    return null;
  }
}

// -------------------------------------------------------
// Serper.devで競合サイト順位を取得
// -------------------------------------------------------
async function fetchSerperRank(keyword, targetUrl) {
  try {
    const resp = await httpRequest({
      url:    'https://google.serper.dev/search',
      method: 'POST',
      headers: {
        'X-API-KEY':    process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
    }, {
      q:  keyword,
      gl: 'jp',
      hl: 'ja',
      num: 20,
    });

    const organic = (resp && resp.organic) || [];

    // targetUrlを含む結果を探す
    const normalizedTarget = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    for (var i = 0; i < organic.length; i++) {
      var link = (organic[i].link || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (link.startsWith(normalizedTarget)) {
        return { position: organic[i].position };
      }
    }

    // 20位圏外
    return { position: null };
  } catch (err) {
    console.error('[SeoRank] Serperエラー keyword=' + keyword + ': ' + err.message);
    return null;
  }
}

// -------------------------------------------------------
// 前回の順位を取得
// -------------------------------------------------------
async function getPrevPosition(keywordId) {
  const record = await db.seoRankRecord.findFirst({
    where:   { keywordId: keywordId },
    orderBy: { checkedAt: 'desc' },
    take:    1,
  });
  return record ? record.position : null;
}

// -------------------------------------------------------
// メインパイプライン
// -------------------------------------------------------
async function runSeoRankPipeline(opts, jobId) {
  opts = opts || {};
  const siteIdFilter   = opts.siteId     || null;
  const keywordIdFilter = opts.keywordIds || null;
  const sendReport     = opts.sendReport !== false; // デフォルトtrue

  console.log('[SeoRank] 開始 siteId=' + (siteIdFilter || 'all'));

  // キーワード取得
  const whereClause = { isActive: true };
  if (siteIdFilter)    whereClause.siteId  = siteIdFilter;
  if (keywordIdFilter) whereClause.id      = { in: keywordIdFilter };

  const keywords = await db.seoKeyword.findMany({ where: whereClause });
  console.log('[SeoRank] 対象キーワード: ' + keywords.length + ' 件');

  if (keywords.length === 0) {
    console.log('[SeoRank] キーワードなし → スキップ');
    return;
  }

  const alerts  = [];
  const allRows = [];

  for (var i = 0; i < keywords.length; i++) {
    var kw = keywords[i];
    console.log('[SeoRank] チェック: ' + kw.keyword + ' (siteId=' + kw.siteId + ' isOwn=' + kw.isOwn + ')');

    var result = null;
    var source = '';

    if (kw.isOwn) {
      // 自サイト: GSC
      result = await fetchGscRank(kw.siteId, kw.keyword);
      source = 'gsc';
    } else {
      // 競合: Serper
      result = await fetchSerperRank(kw.keyword, kw.targetUrl || '');
      source = 'serper';
      // Serper rate limit対策（1秒待機）
      await new Promise(function(r) { setTimeout(r, 1000); });
    }

    // DB保存
    var prevPosition = await getPrevPosition(kw.id);

    await db.seoRankRecord.create({
      data: {
        keywordId:   kw.id,
        checkedAt:   new Date(),
        position:    result ? result.position    : null,
        impressions: result ? result.impressions : null,
        clicks:      result ? result.clicks      : null,
        ctr:         result ? result.ctr         : null,
        source:      source,
      },
    });

    var currentPosition = result ? result.position : null;

    // 順位変動チェック（前回比で5位以上の変動をアラート）
    if (prevPosition != null && currentPosition != null) {
      var diff = currentPosition - prevPosition;
      if (Math.abs(diff) >= 5) {
        alerts.push({
          keyword:      kw.keyword,
          siteId:       kw.siteId,
          targetUrl:    kw.targetUrl || null,
          isOwn:        kw.isOwn,
          prevPosition: prevPosition,
          newPosition:  currentPosition,
        });
      }
    }

    allRows.push({
      keyword:      kw.keyword,
      siteId:       kw.siteId,
      source:       source,
      position:     currentPosition,
      prevPosition: prevPosition,
      impressions:  result ? result.impressions : null,
      clicks:       result ? result.clicks      : null,
      ctr:          result ? result.ctr         : null,
      checkedAt:    new Date(),
    });
  }

  console.log('[SeoRank] 完了 alerts=' + alerts.length);

  // アラートメール
  if (alerts.length > 0) {
    await sendRankAlert(alerts).catch(function(e) {
      console.error('[SeoRank] アラートメールエラー: ' + e.message);
    });
  }

  // 定期レポートPDF送信
  if (sendReport) {
    try {
      const pdfBuf = await generateSeoReportPdf({
        title:       'SEO順位レポート',
        generatedAt: new Date(),
        rows:        allRows,
      });

      const dateStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '');

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

  return { checked: allRows.length, alerts: alerts.length };
}

module.exports = { runSeoRankPipeline };
