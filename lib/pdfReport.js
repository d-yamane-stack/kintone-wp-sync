'use strict';

/**
 * SEO順位レポート PDF生成モジュール
 * pdfkit を使用
 */

const PDFDocument = require('pdfkit');
const path        = require('path');
const os          = require('os');
const fs          = require('fs');

/**
 * SEOレポートPDFを生成してバッファを返す
 * @param {object} opts
 *   opts.title      - レポートタイトル
 *   opts.generatedAt - 生成日時 (Date)
 *   opts.rows       - [{keyword, siteId, source, position, prevPosition, impressions, clicks, ctr, checkedAt}]
 * @returns {Promise<Buffer>}
 */
async function generateSeoReportPdf(opts) {
  return new Promise(function(resolve, reject) {
    const doc  = new PDFDocument({ margin: 40, size: 'A4' });
    const bufs = [];
    doc.on('data', function(d) { bufs.push(d); });
    doc.on('end',  function()  { resolve(Buffer.concat(bufs)); });
    doc.on('error', reject);

    const title       = opts.title || 'SEO順位レポート';
    const generatedAt = opts.generatedAt || new Date();
    const rows        = opts.rows || [];

    // ---- ヘッダ ----
    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#888')
       .text('生成日時: ' + generatedAt.toLocaleString('ja-JP'), { align: 'center' });
    doc.fillColor('#000').moveDown(1);

    // ---- サマリ ----
    const drops  = rows.filter(function(r) { return r.prevPosition != null && r.position > r.prevPosition; });
    const rises  = rows.filter(function(r) { return r.prevPosition != null && r.position < r.prevPosition; });
    const stable = rows.filter(function(r) { return r.prevPosition == null || r.position === r.prevPosition; });

    doc.fontSize(12).text('サマリ');
    doc.moveDown(0.3);
    doc.fontSize(10)
       .text('　計測キーワード数: ' + rows.length)
       .text('　順位上昇: ' + rises.length + ' 件 ▲')
       .text('　順位下落: ' + drops.length + ' 件 ▼')
       .text('　変動なし: ' + stable.length + ' 件');
    doc.moveDown(1);

    // ---- テーブルヘッダ ----
    const cols = [
      { label: 'キーワード',  width: 160 },
      { label: 'サイト',      width: 60  },
      { label: 'ソース',      width: 50  },
      { label: '順位',        width: 45  },
      { label: '前回',        width: 45  },
      { label: '変動',        width: 45  },
      { label: '表示回数',    width: 60  },
      { label: 'クリック',    width: 55  },
    ];

    var x = doc.page.margins.left;
    const headerY = doc.y;

    doc.fontSize(9).fillColor('#333');
    cols.forEach(function(col) {
      doc.text(col.label, x, headerY, { width: col.width, align: 'left' });
      x += col.width;
    });

    doc.moveDown(0.2);
    doc.moveTo(doc.page.margins.left, doc.y)
       .lineTo(doc.page.width - doc.page.margins.right, doc.y)
       .strokeColor('#aaa').stroke();
    doc.moveDown(0.2);

    // ---- データ行 ----
    rows.forEach(function(row, idx) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }

      var rx    = doc.page.margins.left;
      var ry    = doc.y;
      var diff  = row.prevPosition != null ? (row.prevPosition - row.position) : null;
      var diffStr = diff == null ? '-' : (diff > 0 ? '▲' + diff : diff < 0 ? '▼' + Math.abs(diff) : '-');

      var color = '#000';
      if (diff != null && diff < 0)  color = '#c00';
      if (diff != null && diff > 0)  color = '#070';

      const cellData = [
        { val: row.keyword || '',              color: '#000' },
        { val: row.siteId  || '',              color: '#555' },
        { val: row.source  || '',              color: '#555' },
        { val: row.position != null ? String(Math.round(row.position)) : '-', color: '#000' },
        { val: row.prevPosition != null ? String(Math.round(row.prevPosition)) : '-', color: '#888' },
        { val: diffStr,                        color: color  },
        { val: row.impressions != null ? String(row.impressions) : '-', color: '#000' },
        { val: row.clicks     != null ? String(row.clicks)      : '-', color: '#000' },
      ];

      cellData.forEach(function(cell, ci) {
        doc.fontSize(8).fillColor(cell.color)
           .text(cell.val, rx, ry, { width: cols[ci].width, align: 'left' });
        rx += cols[ci].width;
      });

      doc.fillColor('#000').moveDown(0.1);

      if (idx % 2 === 0) {
        doc.rect(doc.page.margins.left, ry - 2, doc.page.width - doc.page.margins.left - doc.page.margins.right, 14)
           .fillOpacity(0.04).fill('#000').fillOpacity(1);
      }
    });

    doc.end();
  });
}

module.exports = { generateSeoReportPdf };
