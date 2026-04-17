'use strict';

const { google } = require('googleapis');
const { CONFIG } = require('../config');

const SHEET_NAME = '施工事例下書きリスト';
const HEADERS = [
  'No.', 'KINTONEレコードID', 'ページタイトル（推敲後）',
  '施工箇所', '施工地', 'リフォーム費用', 'リフォーム期間',
  '物件種別', '築年数', 'メーカー名',
  '【元】施工前の悩み', '【元】リフォームのポイント', '【元】お客様の声',
  '【推敲後】施工前の悩み', '【推敲後】リフォームのポイント',
  'メタディスクリプション',
  '施工前写真枚数', '施工中写真枚数', '施工後写真枚数',
  'WP編集URL', '下書きURL', '処理日時',
];

async function appendToSheet(data, expandedText, wpResult) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  let currentRows = 0;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.google.sheetId,
      range: SHEET_NAME + '!A1:A',
    });
    currentRows = (res.data.values || []).length;
    if (currentRows === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.google.sheetId,
        range: SHEET_NAME + '!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
      currentRows = 1;
    }
  } catch (e) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.google.sheetId,
      range: SHEET_NAME + '!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    currentRows = 1;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.google.sheetId,
    range: SHEET_NAME + '!A' + (currentRows + 1),
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        currentRows,
        data.recordId,
        expandedText.pageTitle,
        data.area,
        data.location,
        data.cost || '',
        data.period,
        data.propertyType,
        data.buildingAge,
        data.makerRaw,
        data.trouble,
        data.reformPoint,
        data.customerVoice,
        expandedText.expandedTrouble,
        expandedText.expandedReformPoint,
        expandedText.metaDescription,
        (data.beforeImages || []).length,
        (data.duringImages || []).length,
        (data.afterImages || []).length,
        wpResult.editUrl,
        wpResult.draftUrl,
        now,
      ]],
    },
  });
}

// ---- コラム生成ログ ----

const COLUMN_SHEET_NAME = 'コラム下書きリスト';
const COLUMN_HEADERS = [
  'No.', 'サイトID', 'キーワード', '想定読者', '文体',
  'ページタイトル', 'メタディスクリプション', '見出し数',
  'WP編集URL', '下書きURL', '処理日時',
];

async function appendColumnToSheet(params, generated, wpResult, siteConfig) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  let currentRows = 0;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.google.sheetId,
      range: COLUMN_SHEET_NAME + '!A1:A',
    });
    currentRows = (res.data.values || []).length;
    if (currentRows === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.google.sheetId,
        range: COLUMN_SHEET_NAME + '!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [COLUMN_HEADERS] },
      });
      currentRows = 1;
    }
  } catch (e) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: COLUMN_SHEET_NAME } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.google.sheetId,
      range: COLUMN_SHEET_NAME + '!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMN_HEADERS] },
    });
    currentRows = 1;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.google.sheetId,
    range: COLUMN_SHEET_NAME + '!A' + (currentRows + 1),
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        currentRows,
        (siteConfig && siteConfig.siteId) || '',
        params.keyword || '',
        params.audience || '',
        params.tone || '',
        generated.pageTitle || '',
        generated.metaDescription || '',
        Array.isArray(generated.headings) ? generated.headings.length : 0,
        wpResult.editUrl,
        wpResult.draftUrl,
        now,
      ]],
    },
  });
}

module.exports = { appendToSheet, appendColumnToSheet };
