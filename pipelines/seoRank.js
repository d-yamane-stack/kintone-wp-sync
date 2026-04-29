'use strict';

/**
 * SEO順位チェックパイプライン（Serper.dev 一本化）
 *
 * - 自サイト・競合サイト、すべて Serper.dev で現在順位を取得
 * - 1回の Serper 検索で自サイト＋全競合の順位を同時取得
 *
 * 呼び出し: runSeoRankPipeline({ siteId?, keywordIds?, sendReport? })
 */

require('dotenv').config({ override: true });

const { httpRequest }             = require('../lib/http');
const { getPrismaClient }         = require('../db/client');
const db                          = getPrismaClient();
const { sendMail, sendRankAlert } = require('../lib/notify');
const { generateSeoReportPdf }    = require('../lib/pdfReport');

// 自サイトのドメイン（siteId → domain）
const OWN_DOMAINS = {
  jube:   'jube.co.jp',
  nurube: 'nuribe.jp',
};

// -------------------------------------------------------
// Serper.dev 検索 → 上位結果を返す
// -------------------------------------------------------
async function fetchSerperResults(keyword) {
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
    console.error('[SeoRank] Serperエラー keyword=' + keyword + ': ' + err.message);
    return [];
  }
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
  return null; // 20位圏外
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

  // キーワード取得
  const kwWhere = { isActive: true };
  if (siteIdFilter)    kwWhere.siteId = siteIdFilter;
  if (keywordIdFilter) kwWhere.id     = { in: keywordIdFilter };

  const keywords = await db.seoKeyword.findMany({ where: kwWhere });
  console.log('[SeoRank] 対象キーワード: ' + keywords.length + ' 件');

  if (keywords.length === 0) {
    console.log('[SeoRank] キーワードなし → スキップ');
    return;
  }

  // 競合ドメイン取得（サイトIDごと）
  const competitorMap = {}; // { siteId: [{domain, label, isActive}] }
  const allCompetitors = await db.seoCompetitor.findMany({ where: { isActive: true } });
  allCompetitors.forEach(function(c) {
    if (!competitorMap[c.siteId]) competitorMap[c.siteId] = [];
    competitorMap[c.siteId].push(c);
  });

  const alerts  = [];
  const allRows = []; // レポート用

  for (var i = 0; i < keywords.length; i++) {
    var kw = keywords[i];
    var ownDomain  = OWN_DOMAINS[kw.siteId] || kw.siteId;
    var competitors = competitorMap[kw.siteId] || [];

    console.log('[SeoRank] 検索: "' + kw.keyword + '" siteId=' + kw.siteId);

    // Serper 検索（1回で全ドメインの順位を取得）
    var organic = await fetchSerperResults(kw.keyword);
    console.log('[SeoRank] 検索結果: ' + organic.length + '件');

    var checkedAt = new Date();

    // 前回の自サイト順位を取得（アラート判定用）
    var prevOwnRecord = await db.seoRankRecord.findFirst({
      where:   { keywordId: kw.id, isOwn: true },
      orderBy: { checkedAt: 'desc' },
    });
    var prevOwnPosition = prevOwnRecord ? prevOwnRecord.position : null;

    // --- 自サイトの順位を保存 ---
    var ownPosition = extractPosition(organic, ownDomain);
    console.log('[SeoRank] 自サイト(' + ownDomain + '): ' + (ownPosition || '圏外'));

    await db.seoRankRecord.create({
      data: {
        keywordId: kw.id,
        checkedAt: checkedAt,
        domain:    ownDomain,
        isOwn:     true,
        position:  ownPosition,
      },
    });

    // アラート判定（5位以上の変動）
    if (prevOwnPosition != null && ownPosition != null) {
      var diff = ownPosition - prevOwnPosition;
      if (Math.abs(diff) >= 5) {
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
      siteId:       kw.siteId,
      domain:       ownDomain,
      isOwn:        true,
      position:     ownPosition,
      prevPosition: prevOwnPosition,
    });

    // --- 競合サイトの順位を保存 ---
    for (var j = 0; j < competitors.length; j++) {
      var comp = competitors[j];
      var compPosition = extractPosition(organic, comp.domain);
      console.log('[SeoRank] 競合(' + comp.domain + '): ' + (compPosition || '圏外'));

      await db.seoRankRecord.create({
        data: {
          keywordId: kw.id,
          checkedAt: checkedAt,
          domain:    comp.domain,
          isOwn:     false,
          position:  compPosition,
        },
      });

      allRows.push({
        keyword:  kw.keyword,
        siteId:   kw.siteId,
        domain:   comp.domain,
        isOwn:    false,
        position: compPosition,
      });
    }

    // Serper rate limit 対策（1秒待機）
    if (i < keywords.length - 1) {
      await new Promise(function(r) { setTimeout(r, 1000); });
    }
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
