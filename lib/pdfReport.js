'use strict';

/**
 * SEO順位レポート PDF生成モジュール
 * pdfkit を使用
 */

const PDFDocument = require('pdfkit');
const path        = require('path');
const os          = require('os');
const fs          = require('fs');

// 日本語フォントの候補（優先順）
const JA_FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\NotoSansJP-VF.ttf',
  'C:\\Windows\\Fonts\\NotoSans-Regular.ttf',
  'C:\\Windows\\Fonts\\meiryo.ttc',
  'C:\\Windows\\Fonts\\msgothic.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
];

function findJaFont() {
  for (var i = 0; i < JA_FONT_CANDIDATES.length; i++) {
    if (fs.existsSync(JA_FONT_CANDIDATES[i])) return JA_FONT_CANDIDATES[i];
  }
  return null;
}

/**
 * SEOレポートPDFを生成してバッファを返す
 * @param {object} opts
 *   opts.title      - レポートタイトル
 *   opts.generatedAt - 生成日時 (Date)
 *   opts.rows       - [{keyword, siteId, source, position, prevPosition, impressions, clicks, ctr, checkedAt}]
 * @returns {Promise<Buffer>}
 */
async function generateSeoReportPdf(opts) {
  const jaFontPath = findJaFont();

  return new Promise(function(resolve, reject) {
    const doc  = new PDFDocument({ margin: 40, size: 'A4' });

    // 日本語フォント登録
    if (jaFontPath) {
      try {
        doc.registerFont('ja', jaFontPath);
        doc.font('ja');
        console.log('[PDF] 日本語フォント使用: ' + jaFontPath);
      } catch (e) {
        console.warn('[PDF] フォント登録失敗、デフォルト使用: ' + e.message);
      }
    } else {
      console.warn('[PDF] 日本語フォントが見つかりません');
    }
    const bufs = [];
    doc.on('data', function(d) { bufs.push(d); });
    doc.on('end',  function()  { resolve(Buffer.concat(bufs)); });
    doc.on('error', reject);

    const title       = opts.title || 'SEO順位レポート';
    const generatedAt = opts.generatedAt || new Date();
    const rows        = opts.rows || [];

    const dateStr = generatedAt.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const mL = doc.page.margins.left;
    const mR = doc.page.margins.right;
    const pageW = doc.page.width;
    const contentW = pageW - mL - mR;

    // ---- ヘッダ（絶対座標） ----
    var curY = 40;
    doc.fontSize(22).fillColor('#1a1a2e')
       .text('SEO順位レポート', mL, curY, { width: contentW, align: 'center' });
    curY += 32;
    doc.fontSize(10).fillColor('#888')
       .text(dateStr + ' 時点', mL, curY, { width: contentW, align: 'center' });
    curY += 28;

    // ---- サマリボックス ----
    const ranked = rows.filter(function(r) { return r.position != null; });
    const drops  = rows.filter(function(r) { return r.prevPosition != null && r.position != null && r.position > r.prevPosition; });
    const rises  = rows.filter(function(r) { return r.prevPosition != null && r.position != null && r.position < r.prevPosition; });

    const boxH  = 68;
    const colW  = contentW / 4;

    doc.rect(mL, curY, contentW, boxH).fillColor('#f0f4ff').fill();

    [
      { label: '計測キーワード', val: rows.length + ' 件',   color: '#1a1a2e' },
      { label: '順位取得済み',   val: ranked.length + ' 件', color: '#1a1a2e' },
      { label: '順位上昇 ▲',    val: rises.length + ' 件',  color: '#15803d' },
      { label: '順位下落 ▼',    val: drops.length + ' 件',  color: '#dc2626' },
    ].forEach(function(item, i) {
      var ix = mL + colW * i + 8;
      doc.fontSize(8).fillColor('#666')
         .text(item.label, ix, curY + 10, { width: colW - 8, lineBreak: false });
      doc.fontSize(18).fillColor(item.color)
         .text(item.val,   ix, curY + 26, { width: colW - 8, lineBreak: false });
    });

    curY += boxH + 20;

    // ---- テーブル ----
    const cols = [
      { label: 'キーワード', width: 170 },
      { label: 'サイト',     width: 50  },
      { label: '種別',       width: 42  },
      { label: '現在順位',   width: 52  },
      { label: '前回',       width: 42  },
      { label: '変動',       width: 42  },
      { label: '表示回数',   width: 52  },
      { label: 'クリック',   width: 48  },
    ];
    const tableW = cols.reduce(function(s, c) { return s + c.width; }, 0);
    const rowH   = 20;

    // ヘッダ行
    doc.rect(mL, curY, tableW, rowH).fillColor('#1a1a2e').fill();
    var hx = mL;
    cols.forEach(function(col) {
      doc.fontSize(8).fillColor('#ffffff')
         .text(col.label, hx + 4, curY + 6, { width: col.width - 4, lineBreak: false });
      hx += col.width;
    });
    curY += rowH;

    // データ行
    rows.forEach(function(row, idx) {
      if (curY > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
        if (jaFontPath) { try { doc.font('ja'); } catch(e) {} }
        curY = doc.page.margins.top;
      }

      // 行背景（縞）
      if (idx % 2 === 1) {
        doc.rect(mL, curY, tableW, rowH).fillColor('#f5f5f5').fill();
      } else {
        doc.rect(mL, curY, tableW, rowH).fillColor('#ffffff').fill();
      }

      var diff     = (row.prevPosition != null && row.position != null)
                       ? Math.round(row.prevPosition) - Math.round(row.position)
                       : null;
      var diffStr  = diff == null ? '-'
                   : diff > 0    ? '+' + diff
                   : diff < 0    ? String(diff)
                   : '±0';
      var diffClr  = diff == null ? '#999'
                   : diff > 0    ? '#15803d'
                   : diff < 0    ? '#dc2626'
                   : '#999';
      var posStr   = row.position != null ? Math.round(row.position) + '位' : '圏外';
      var prevStr  = row.prevPosition != null ? Math.round(row.prevPosition) + '位' : '-';

      var cells = [
        { val: row.keyword || '-', color: '#1a1a2e' },
        { val: row.siteId  || '-', color: '#555' },
        { val: row.source  || '-', color: '#888' },
        { val: posStr,             color: '#000' },
        { val: prevStr,            color: '#888' },
        { val: diffStr,            color: diffClr },
        { val: row.impressions != null ? row.impressions.toLocaleString() : '-', color: '#555' },
        { val: row.clicks      != null ? String(row.clicks) : '-',              color: '#555' },
      ];

      var cx = mL;
      cells.forEach(function(cell, ci) {
        doc.fontSize(8).fillColor(cell.color)
           .text(cell.val, cx + 4, curY + 6, { width: cols[ci].width - 6, lineBreak: false });
        cx += cols[ci].width;
      });

      // 下線
      doc.moveTo(mL, curY + rowH)
         .lineTo(mL + tableW, curY + rowH)
         .strokeColor('#e0e0e0').lineWidth(0.5).stroke();

      curY += rowH;
    });

    // ---- フッタ ----
    curY += 20;
    doc.fontSize(8).fillColor('#bbb')
       .text('RE-WRITE 自動生成  |  自サイト: Google Search Console  |  競合: Serper.dev',
             mL, curY, { width: contentW, align: 'center', lineBreak: false });

    doc.end();
  });
}

module.exports = { generateSeoReportPdf };
