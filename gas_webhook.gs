/**
 * Google Apps Script - Webhook受信 → スプレッドシート記録
 * 
 * 【設定手順】
 * 1. Google スプレッドシートを新規作成
 * 2. 拡張機能 → Apps Script を開く
 * 3. このコードを貼り付けて保存
 * 4. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 * 5. 実行ユーザー: 自分、アクセス: 全員 → デプロイ
 * 6. 表示されたURLを .env の GAS_WEBHOOK_URL に設定
 */

// =============================
// 設定
// =============================
const SHEET_NAME = '施工事例下書きリスト';

// スプレッドシートのヘッダー定義
const HEADERS = [
  'No.',
  'KINTONEレコードID',
  'ページタイトル',
  '施工箇所',
  '施工地',
  'リフォーム費用',
  'リフォーム期間',
  'WP編集URL',
  '下書きURL',
  '処理日時',
  'ステータス',
];

// =============================
// Webhook受信（POSTリクエスト）
// =============================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    appendRow(payload);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GETリクエスト（動作確認用）
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Webhook is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================
// スプレッドシート操作
// =============================
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // ヘッダー行を設定
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    // ヘッダー行のスタイル設定
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setFrozen && sheet.setFrozenRows(1);
    // 列幅調整
    sheet.setColumnWidth(3, 300); // ページタイトル
    sheet.setColumnWidth(8, 350); // WP編集URL
    sheet.setColumnWidth(9, 350); // 下書きURL
  }

  return sheet;
}

function appendRow(payload) {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  const rowNumber = lastRow; // ヘッダー除く行番号

  const now = new Date(payload.createdAt || new Date());
  const formattedDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  const row = [
    rowNumber,                          // No.（ヘッダー除く連番）
    payload.recordId || '',             // KINTONEレコードID
    payload.title || '',                // ページタイトル
    payload.area || '',                 // 施工箇所
    payload.location || '',             // 施工地
    payload.cost ? `${payload.cost}円` : '', // リフォーム費用
    payload.period || '',               // リフォーム期間
    payload.editUrl || '',              // WP編集URL
    payload.draftUrl || '',             // 下書きURL
    formattedDate,                      // 処理日時
    '下書き',                           // ステータス
  ];

  sheet.appendRow(row);

  // 編集URLをハイパーリンクに変換
  const newRow = sheet.getLastRow();
  if (payload.editUrl) {
    sheet.getRange(newRow, 8).setFormula(
      `=HYPERLINK("${payload.editUrl}","編集画面を開く")`
    );
  }
  if (payload.draftUrl) {
    sheet.getRange(newRow, 9).setFormula(
      `=HYPERLINK("${payload.draftUrl}","下書きプレビュー")`
    );
  }

  // 偶数行に薄い背景色
  if (newRow % 2 === 0) {
    sheet.getRange(newRow, 1, 1, HEADERS.length).setBackground('#f8f9fa');
  }
}

// =============================
// テスト用関数（GASエディタから実行可能）
// =============================
function testWebhook() {
  const testPayload = {
    recordId: 'TEST-001',
    title: 'キッチンリフォームで広々空間を実現した施工事例',
    area: 'キッチン 間口2250mm',
    location: '千葉県松戸市',
    cost: '1907',
    period: '2日',
    editUrl: 'https://jube.co.jp/refresh2022/wp-admin/post.php?post=999&action=edit',
    draftUrl: 'https://jube.co.jp/refresh2022/?p=999&preview=true',
    createdAt: new Date().toISOString(),
  };

  appendRow(testPayload);
  Logger.log('テストデータを追加しました');
}
