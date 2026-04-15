require('dotenv').config();
const { google } = require('googleapis');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = '施工事例下書きリスト';

  // 実データ（4行目）の順序に完全一致したヘッダー
  const HEADERS = [
    'No.',                          // A: 3
    'KINTONEレコードID',             // B: 3677
    'ページタイトル（推敲後）',        // C: 戸建て浴室・洗...
    '施工箇所',                      // D: 浴室、洗面化粧台
    '施工地',                        // E: 千葉県柏市
    'リフォーム費用',                 // F: 170万円
    'リフォーム期間',                 // G: 5日間
    '物件種別',                      // H: 戸建て
    'メーカー名',                     // I: 空
    'お客様の声（原文）',              // J: ユニットバス：クリナップ...
    '施工前の悩み（原文）',            // K: 特に気にされて...
    'リフォームのポイント（原文）',     // L: 浴室と洗面所を...
    '施工前の悩み（推敲後）',          // M: 築年数の経った...
    'リフォームのポイント（推敲後）',   // N: 今回のリフォーム...
    'メタディスクリプション',           // O: 戸建住宅の浴室...
    '施工前写真枚数',                 // P: 3
    '施工中写真枚数',                 // Q: 2
    '施工後写真枚数',                 // R: 4
    'WP編集URL',                     // S: https://...
    '下書きURL',                      // T: https://...
    '処理日時',                       // U: 2026/4/12 12:28:48
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: sheetName + '!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  console.log('ヘッダーを更新しました（' + HEADERS.length + '列）');
}

main().catch(console.error);
