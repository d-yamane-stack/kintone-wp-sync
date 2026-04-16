/**
 * KINTONE → Claude API → WordPress → Google Sheets 自動連携スクリプト
 * 更新: 画像クレンジング / 修正前後テキスト記録 / 開始トリガー
 */

require('dotenv').config();
const https = require('https');
const http = require('http');
const readline = require('readline');
const { google } = require('googleapis');


const CONFIG = {
  kintone: {
    subdomain: process.env.KINTONE_SUBDOMAIN,
    appId: process.env.KINTONE_APP_ID,
    apiToken: process.env.KINTONE_API_TOKEN,
  },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  wordpress: {
    baseUrl: process.env.WP_BASE_URL,
    restBase: (process.env.WP_BASE_URL || 'https://jube.co.jp').replace(/\/$/, '') + '/wp-json/wp/v2/',
    postType: process.env.WP_POST_TYPE,
    username: process.env.WP_USERNAME,
    appPassword: process.env.WP_APP_PASSWORD,

  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    credentialsPath: './credentials.json',
  },
  image: { maxWidth: 1200, brightness: 1.08, contrast: 1.10, quality: 88 },
};

// --- Taxonomy Mappings ---
const CATEGORY_MAP = {
  'キッチン': 'kitchen',
  '浴室': 'bath',
  '洗面化粧台': 'washroom',
  'トイレ': 'toilet',
  '窓・玄関': 'entrance',
  '内装': 'interior',
  '外観': 'exterior',
  '小工事': 'detail',
  'LDK': 'ldk',
  '増改築': 'reconstruction',
};

const AREA_MAP = {
  '佐倉市': 'sakura', '八街市': 'yachimata', '匝瑳市': 'sosa', '千葉市': 'chiba',
  '印旛郡': 'inba', '印西市': 'inzai', '四街道市': 'yotsukaido', '大網白里市': 'oamishirasato',
  '富里市': 'tomisato', '山武市': 'sanmu', '山武郡': 'sanmu', '成田市': 'narita',
  '我孫子市': 'abiko', '旭市': 'asahi', '東金市': 'togane', '松戸市': 'matsudo',
  '柏市': 'kashiwa', '流山市': 'nagareyama', '船橋市': 'funabashi', '茂原市': 'mobara',
  '銚子市': 'choshi', '長生郡': 'chosei', '香取郡': 'katori', '香取市': 'katori',
  'つくばみらい市': 'tsukubamirai', 'つくば市': 'tsukuba', 'ひたちなか市': 'hitachinaka',
  '取手市': 'toride', '土浦市': 'tsuchiura', '守谷市': 'moriya', '常総市': 'joso',
  '日立市': 'hitachi', '東茨城郡': 'higashiibaraki', '水戸市': 'mito', '潮来市': 'itako',
  '牛久市': 'ushiku', '神栖市': 'kamisu', '稲敷市': 'inashiki', '稲敷郡': 'inashiki',
  '行方市': 'namegata', '那珂市': 'naka', '鉾田市': 'hokota', '阿見町': 'ami',
  '鹿嶋市': 'kashima', '龍ケ崎市': 'ryugasaki'
};

let fetchedTerms = {
  example_category: null,
  example_area: null,
  example_showroom: null,
};

// WP側のmakerプルダウンの許容値リスト
const MAKER_LIST = [
  'LIXIL', 'TOTO', 'パナソニック', 'クリナップ',
  'タカラスタンダード', 'TOCLAS', 'FIRST PLUS',
  'WOODONE', 'エイダイ', 'ノーリツ', 'ハウジング重兵衛特別仕様'
];

// Claudeが出力したメーカー名をMAKER_LISTと照合する
function matchMakerName(name) {
  if (!name) return '';
  var normalized = name.trim().toLowerCase().replace(/[ａ-ｚ]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  for (var i = 0; i < MAKER_LIST.length; i++) {
    var cand = MAKER_LIST[i].toLowerCase().replace(/[ａ-ｚ]/g, function(c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (normalized === cand || normalized.includes(cand) || cand.includes(normalized)) {
      return MAKER_LIST[i]; // WP正式値を返す
    }
  }
  return ''; // 不一致の場合は空
}

// WP側のtenpoプルダウンの許容値リスト
const TENPO_LIST = [
  '本社（成田ショールーム）',
  '千葉若葉ショールーム店',
  '旭・東総店',
  'パルナ稲敷・佐原ショールーム店',
  '鹿嶋・神栖店',
  '牛久・龍ヶ崎・阿見店',
  '佐倉ショールーム店',
  '柏ショールーム店',
  '東金ショールーム店',
  '茨城本店・水戸ショールーム',
  '取手・守谷ショールーム店',
];

// KINTONEの店舗選択値をTENPO_LISTと部分一致で照合する
function matchTenpoName(name) {
  if (!name) return '';
  var normalized = name.trim();
  // 完全一致を優先
  for (var i = 0; i < TENPO_LIST.length; i++) {
    if (normalized === TENPO_LIST[i]) return TENPO_LIST[i];
  }
  // 部分一致（どちらかが含む）
  for (var j = 0; j < TENPO_LIST.length; j++) {
    if (normalized.includes(TENPO_LIST[j]) || TENPO_LIST[j].includes(normalized)) {
      return TENPO_LIST[j];
    }
  }
  return ''; // 不一致の場合は空
}

// -------------------------

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(options.url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 120000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(responseBody.toString())); }
          catch { resolve(responseBody); }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + responseBody.toString()));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP Request Timeout (120s)'));
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) req.write(body);
      else req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function httpRequestBinary(requestUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(requestUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) {
          return reject(new Error('リダイレクトレスポンスにLocationヘッダーがありません'));
        }
        return httpRequestBinary(location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/jpeg',
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

let sharpLib;
async function loadSharp() {
  if (sharpLib) return sharpLib;
  try {
    sharpLib = require('sharp');
  } catch {
    console.log('  sharpをインストール中...');
    await new Promise((resolve, reject) => {
      require('child_process').exec('npm install sharp', (err) => err ? reject(err) : resolve());
    });
    sharpLib = require('sharp');
  }
  return sharpLib;
}

async function cleanseImage(imageBuffer) {
  const s = await loadSharp();
  return s(imageBuffer)
    .resize(CONFIG.image.maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
    .modulate({ brightness: CONFIG.image.brightness, saturation: 1.05 })
    .linear(CONFIG.image.contrast, -(128 * CONFIG.image.contrast - 128))
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: CONFIG.image.quality, mozjpeg: true })
    .toBuffer();
}

async function getKintoneRecords(limit, offset) {
  offset = offset || 0;
  const query = encodeURIComponent('limit ' + limit + ' offset ' + offset);
  const result = await httpRequest({
    url: 'https://' + CONFIG.kintone.subdomain + '.cybozu.com/k/v1/records.json?app=' + CONFIG.kintone.appId + '&query=' + query,
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': CONFIG.kintone.apiToken },
  });
  if (!result || !Array.isArray(result.records)) {
    throw new Error('KINTONEからのレスポンスが不正です: ' + JSON.stringify(result).substring(0, 200));
  }
  return result.records;
}

async function downloadKintoneImage(fileKey) {
  return httpRequestBinary(
    'https://' + CONFIG.kintone.subdomain + '.cybozu.com/k/v1/file.json?fileKey=' + fileKey,
    { 'X-Cybozu-API-Token': CONFIG.kintone.apiToken }
  );
}

// 住所から都道府県＋市区町村を抽出するヘルパー関数
function extractCity(address) {
  if (!address) return '';
  var prefMatch = address.match(/^(東京都|北海道|(?:大阪|京都)府|.{2,3}県)/);
  var pref = prefMatch ? prefMatch[1] : '';
  var rest = address.slice(pref.length);
  var cityMatch = rest.match(/^.{1,5}?(?:市|区|町|村)/);
  if (cityMatch) return pref + cityMatch[0];
  return pref || address;
}

function extractRecordData(record) {
  const areaValue = record['施工箇所'] && record['施工箇所'].value;
  const area = Array.isArray(areaValue) ? areaValue.join('、') : (areaValue || '');
  const rawArea = Array.isArray(areaValue) ? areaValue : (areaValue ? [areaValue] : []);
  const rawLocation = (record['住所'] && record['住所'].value) || '';
  const tantoRaw = record['作成者'] && record['作成者'].value;
  const tenpoRaw = record['店舗選択'] && record['店舗選択'].value;
  return {
    recordId: (record['$id'] && record['$id'].value) || '',
    title: (record['施工事例UPレコード番号'] && record['施工事例UPレコード番号'].value) || (record['$id'] && record['$id'].value) || '',
    location: rawLocation,
    city: extractCity(rawLocation),
    area: area,
    rawArea: rawArea,
    propertyType: (record['物件種別'] && record['物件種別'].value) || '',
    period: (record['リフォーム期間'] && record['リフォーム期間'].value) || '',
    cost: (record['リフォーム費用'] && record['リフォーム費用'].value) || '',
    trouble: (record['施工主様のお悩み'] && record['施工主様のお悩み'].value) || '',
    reformPoint: (record['リフォームのポイント'] && record['リフォームのポイント'].value) || '',
    customerVoice: (record['お客様の声'] && record['お客様の声'].value) || '',
    makerRaw: (record['メーカー名や商品名'] && record['メーカー名や商品名'].value) || '',
    menseki: (record['施工面積'] && record['施工面積'].value) || '',
    buildingAge: (record['築年数'] && record['築年数'].value) || '',
    tantoMessage: (record['担当者から一言'] && record['担当者から一言'].value) || '',
    tanto: (tantoRaw && (typeof tantoRaw === 'object' ? tantoRaw.name : tantoRaw)) || '',
    tenpo: Array.isArray(tenpoRaw) ? tenpoRaw.join('、') : (tenpoRaw || ''),
    beforeImages: (record['施工前の写真'] && record['施工前の写真'].value) || [],
    duringImages: (record['施工中の写真'] && record['施工中の写真'].value) || [],
    afterImages: (record['施工後の写真'] && record['施工後の写真'].value) || [],
  };

}

async function expandTextWithClaude(data) {
  const prompt = 'あなたはリフォーム会社のウェブサイト向けコンテンツライターです。\n以下の施工事例の情報を元に、SEOを意識しながら自然で読みやすい文章に拡張・推敲してください。\n\n【施工箇所】' + data.area + '\n【物件種別】' + data.propertyType + '\n【リフォーム期間】' + data.period + '\n【リフォーム費用】' + data.cost + '\n【メーカー/製品名（原文）】' + data.makerRaw + '\n【担当者から一言（原文）】' + data.tantoMessage + '\n\n【施工前の悩み（原文）】\n' + data.trouble + '\n\n【リフォームのポイント（原文）】\n' + data.reformPoint + '\n\n以下のJSON形式のみで返答してください：\n{\n  "pageTitle": "SEOを意識した魅力的なページタイトル（30〜40文字）",\n  "metaDescription": "メタディスクリプション（120文字前後）",\n  "expandedTrouble": "施工前の悩みを膨らませた文章（200〜300文字）",\n  "expandedReformPoint": "リフォームのポイントを詳しく説明（300〜400文字）",\n  "expandedTantoMessage": "担当者からの一言を自然な文体で拡張（100〜150文字）",\n  "makerName": "メーカー名のみ（例：TOTO / リクシル）、不明な場合は空文字",\n  "productName": "商品名・シリーズ名のみ（例：サザナ / アライズ）、不明な場合は空文字"\n}';

  const response = await httpRequest({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
  }, {
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(function(c) { return c.type === 'text'; });
  if (!textContent) throw new Error('Claude APIからテキストが返されませんでした');
  try {
    return JSON.parse(textContent.text.replace(/```json|```/g, '').trim());
  } catch (e) {
    throw new Error('Claude APIレスポンスのパース失敗: ' + textContent.text);
  }
}

// =============================
// WP REST API
// =============================

function getWpAuthHeader() {
  return 'Basic ' + Buffer.from(CONFIG.wordpress.username + ':' + CONFIG.wordpress.appPassword).toString('base64');
}

async function uploadImageRestApi(imageBuffer, filename) {
  try {
    const response = await httpRequest({
      url: CONFIG.wordpress.restBase + 'media',
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(),
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="' + filename + '"'
      }
    }, imageBuffer);
    
    if (response && response.id) return response.id;
    console.warn('  [警告] REST API 画像アップロードに失敗しました', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
    return null;
  } catch (err) {
    console.warn('  [警告] 画像アップロード通信エラー: ' + err.message);
    return null;
  }
}

async function getTermIdsByTaxonomyRestApi(taxonomy) {
  try {
    const url = CONFIG.wordpress.restBase + taxonomy + '?per_page=100';
    const response = await httpRequest({
      url: url,
      method: 'GET',
      headers: {
        'Authorization': getWpAuthHeader(),
      }
    });

    if (Array.isArray(response)) {
      return response.map(t => ({ slug: t.slug, name: t.name || '', term_id: parseInt(t.id, 10) }));
    } else {
      console.warn('  [警告] REST API ターム取得で予期せぬレスポンス（' + taxonomy + '）', typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response);
      return [];
    }
  } catch (err) {
    console.warn('  [警告] REST API ターム取得通信エラー（' + taxonomy + '）: ' + err.message);
    return [];
  }
}

async function createWordPressDraft(data, expandedText, featuredImageId) {
  const acf = {
    nayami: expandedText.expandedTrouble || '',
    point: expandedText.expandedReformPoint || '',
    koe: data.customerVoice || '',
    hiyou: data.cost || '',
    kikan: data.period || '',
    area: data.city || '',
    shubetu: data.propertyType || '',
    tiku: data.buildingAge || '',
    maker: matchMakerName(expandedText.makerName),
    shohin: expandedText.productName || '',
    menseki: data.menseki || '',
    tanto_message: expandedText.expandedTantoMessage || '',
    tanto_free: data.tanto || '',
    tenpo: matchTenpoName(data.tenpo),
  };

  const postData = {
    title: expandedText.pageTitle,
    content: '',
    status: 'draft',
    acf: acf,
  };
  if (featuredImageId) postData.featured_media = featuredImageId;

  if (data._categoryTermIds && data._categoryTermIds.length > 0) {
    postData.example_category = data._categoryTermIds;
  }
  if (data._areaTermIds && data._areaTermIds.length > 0) {
    postData.example_area = data._areaTermIds;
  }
  if (data._showroomTermIds && data._showroomTermIds.length > 0) {
    postData.example_showroom = data._showroomTermIds;
  }

  try {
    const postType = CONFIG.wordpress.postType || 'example';
    const response = await httpRequest({
      url: CONFIG.wordpress.restBase + postType,
      method: 'POST',
      headers: {
        'Authorization': getWpAuthHeader(),
        'Content-Type': 'application/json'
      }
    }, JSON.stringify(postData));

    if (!response || !response.id) {
      throw new Error('REST API投稿エラー: ' + (typeof response === 'object' ? JSON.stringify(response).substring(0, 200) : response));
    }

    const postId = response.id;

    // Step 2: after-main / before-main ACF Repeaterフィールドを追加送信（PATCH）
    const afterIds = data._afterImageIds || [];
    const beforeIds = data._beforeImageIds || [];
    if (afterIds.length > 0 || beforeIds.length > 0) {
      const patchAcf = {};
      if (afterIds.length > 0) {
        patchAcf['after-main'] = afterIds.map(function(id) { return { 'after-img': id }; });
      }
      if (beforeIds.length > 0) {
        patchAcf['before-main'] = beforeIds.map(function(id) { return { 'before-img': id }; });
      }
      try {
        await httpRequest({
          url: CONFIG.wordpress.restBase + postType + '/' + postId,
          method: 'PATCH',
          headers: {
            'Authorization': getWpAuthHeader(),
            'Content-Type': 'application/json'
          }
        }, JSON.stringify({ acf: patchAcf }));
        console.log('  after-main/before-main ACF登録完了 (施工後' + afterIds.length + '枚 / 施工前' + beforeIds.length + '枚)');
      } catch (patchErr) {
        console.warn('  [警告] after-main/before-main PATCH失敗: ' + patchErr.message);
      }
    }

    return {
      postId: postId,
      draftUrl: CONFIG.wordpress.baseUrl + '/?p=' + postId + '&preview=true',
      editUrl: CONFIG.wordpress.baseUrl + '/wp-admin/post.php?post=' + postId + '&action=edit',
    };
  } catch (err) {
    console.error('WP Draft 作成エラー: ', err.message);
    throw err;
  }
}

async function appendToSheet(data, expandedText, wpResult) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const sheetName = '施工事例下書きリスト';
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });


  // KINTONEの全情報＋推敲前後テキストを記録
  const HEADERS = [
    'No.', 'KINTONEレコードID', 'ページタイトル（推敲後）',
    // KINTONE元データ
    '施工箇所', '施工地', 'リフォーム費用', 'リフォーム期間',
    '物件種別', '築年数', 'メーカー名',
    '【元】施工前の悩み', '【元】リフォームのポイント', '【元】お客様の声',
    // 推敲後テキスト
    '【推敲後】施工前の悩み', '【推敲後】リフォームのポイント',
    'メタディスクリプション',
    // 画像枚数
    '施工前写真枚数', '施工中写真枚数', '施工後写真枚数',
    // URL
    'WP編集URL', '下書きURL', '処理日時',
  ];

  let currentRows = 0;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.google.sheetId,
      range: sheetName + '!A1:A',
    });
    currentRows = (res.data.values || []).length;
    if (currentRows === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.google.sheetId,
        range: sheetName + '!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
      currentRows = 1;
    }
  } catch (e) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.google.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.google.sheetId,
      range: sheetName + '!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    currentRows = 1;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.google.sheetId,
    range: sheetName + '!A' + (currentRows + 1),
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        currentRows,
        data.recordId,
        expandedText.pageTitle,
        // KINTONE元データ（円の重複なし）
        data.area,
        data.location,
        data.cost || '',          // 円を付けない（元データのまま）
        data.period,
        data.propertyType,
        data.buildingAge,
        data.makerRaw,
        // 推敲前テキスト（原文）
        data.trouble,
        data.reformPoint,
        data.customerVoice,       // お客様の声は原文のまま
        // 推敲後テキスト
        expandedText.expandedTrouble,
        expandedText.expandedReformPoint,
        expandedText.metaDescription,
        // 画像枚数
        (data.beforeImages || []).length,
        (data.duringImages || []).length,
        (data.afterImages || []).length,
        // URL
        wpResult.editUrl,
        wpResult.draftUrl,
        now,
      ]],
    },
  });
}

async function processRecord(record) {
  const data = extractRecordData(record);
  console.log('\n処理開始: レコードID ' + data.recordId + ' / ' + (data.area || '施工箇所不明'));

  console.log('  Claude APIでテキスト拡張中...');
  const expandedText = await expandTextWithClaude(data);
  console.log('  タイトル: ' + expandedText.pageTitle);

  let featuredImageId = null;
  const afterImages = data.afterImages || [];
  const beforeImages = data.beforeImages || [];
  const duringImages = data.duringImages || [];
  const allImages = [].concat(afterImages, beforeImages, duringImages);

  if (allImages.length > 0) {
    console.log('  画像クレンジング＆アップロード中... (' + allImages.length + '枚)');
    const afterIds = [];
    const beforeIds = [];

    // 施工後写真をアップロード
    for (var ai = 0; ai < afterImages.length; ai++) {
      try {
        const fileKey = afterImages[ai].fileKey || afterImages[ai];
        const imgResult = await downloadKintoneImage(fileKey);
        const cleansedBuffer = await cleanseImage(imgResult.buffer);
        const mediaId = await uploadImageRestApi(cleansedBuffer, 'jirei-' + data.recordId + '-after-' + (ai + 1) + '.jpg');
        if (mediaId) {
          afterIds.push(mediaId);
          // if (ai === 0) featuredImageId = mediaId; // 1枚目をアイキャッチに（一旦ペンディング）
          console.log('  施工後写真 ' + (ai + 1) + '/' + afterImages.length + ' アップロード完了: ID ' + mediaId);
        }
        await sleep(500);
      } catch (err) {
        console.warn('  施工後写真 ' + (ai + 1) + ' 失敗: ' + err.message);
      }
    }

    // 施工前写真をアップロード
    for (var bi = 0; bi < beforeImages.length; bi++) {
      try {
        const fileKey = beforeImages[bi].fileKey || beforeImages[bi];
        const imgResult = await downloadKintoneImage(fileKey);
        const cleansedBuffer = await cleanseImage(imgResult.buffer);
        const mediaId = await uploadImageRestApi(cleansedBuffer, 'jirei-' + data.recordId + '-before-' + (bi + 1) + '.jpg');
        if (mediaId) {
          beforeIds.push(mediaId);
          console.log('  施工前写真 ' + (bi + 1) + '/' + beforeImages.length + ' アップロード完了: ID ' + mediaId);
        }
        await sleep(500);
      } catch (err) {
        console.warn('  施工前写真 ' + (bi + 1) + ' 失敗: ' + err.message);
      }
    }

    // 施工中写真をアップロード
    const duringIds = [];
    for (var di = 0; di < duringImages.length; di++) {
      try {
        const fileKey = duringImages[di].fileKey || duringImages[di];
        const imgResult = await downloadKintoneImage(fileKey);
        const cleansedBuffer = await cleanseImage(imgResult.buffer);
        const mediaId = await uploadImageRestApi(cleansedBuffer, 'jirei-' + data.recordId + '-during-' + (di + 1) + '.jpg');
        if (mediaId) {
          duringIds.push(mediaId);
          console.log('  施工中写真 ' + (di + 1) + '/' + duringImages.length + ' アップロード完了: ID ' + mediaId);
        }
        await sleep(500);
      } catch (err) {
        console.warn('  施工中写真 ' + (di + 1) + ' 失敗: ' + err.message);
      }
    }

    // 画像IDをcustom_fieldsに追加するためdataに保存
    data._afterImageIds = afterIds;
    data._beforeImageIds = beforeIds;
    data._duringImageIds = duringIds;
    console.log('  画像アップロード完了: 施工後' + afterIds.length + '枚 / 施工中' + duringIds.length + '枚 / 施工前' + beforeIds.length + '枚');
  }


  console.log('  タクソノミー情報を準備中...');
  const categorySlugsToSet = [];
  (data.rawArea || []).forEach(function(val) {
    if (CATEGORY_MAP[val]) categorySlugsToSet.push(CATEGORY_MAP[val]);
  });

  const areaSlugsToSet = [];
  if (data.location) {
    for (var key in AREA_MAP) {
      if (data.location.includes(key)) {
        areaSlugsToSet.push(AREA_MAP[key]);
        break;
      }
    }
  }

  data._categorySlugs = categorySlugsToSet;
  data._areaSlugs = areaSlugsToSet;

  try {
    if (!fetchedTerms.example_category && categorySlugsToSet.length > 0) {
      fetchedTerms.example_category = await getTermIdsByTaxonomyRestApi('example_category');
    }
    if (!fetchedTerms.example_area && areaSlugsToSet.length > 0) {
      fetchedTerms.example_area = await getTermIdsByTaxonomyRestApi('example_area');
    }
    if (!fetchedTerms.example_showroom) {
      fetchedTerms.example_showroom = await getTermIdsByTaxonomyRestApi('example_showroom');
    }
  } catch (err) {
    console.warn('  [警告] ターム取得に失敗しましたが処理を継続します: ' + err.message);
  }

  const tCategoryIds = [];
  if (fetchedTerms.example_category) {
    categorySlugsToSet.forEach(function(slug) {
      var t = fetchedTerms.example_category.find(function(i) { return i.slug === slug; });
      if (t) tCategoryIds.push(t.term_id);
      else console.log('    ※example_categoryのターム(slug: ' + slug + ')がWordPress側に見つかりません');
    });
  }

  const tAreaIds = [];
  if (fetchedTerms.example_area) {
    areaSlugsToSet.forEach(function(slug) {
      var t = fetchedTerms.example_area.find(function(i) { return i.slug === slug; });
      if (t) tAreaIds.push(t.term_id);
      else console.log('    ※example_areaのターム(slug: ' + slug + ')がWordPress側に見つかりません');
    });
  }

  // example_showroom ターム照合（スラッグまたは名前で部分一致）
  const tShowroomIds = [];
  const tenpoWpName = matchTenpoName(data.tenpo);
  if (fetchedTerms.example_showroom) {
    if (tenpoWpName) {
      const tenpoNorm = tenpoWpName.toLowerCase();
      fetchedTerms.example_showroom.forEach(function(term) {
        var termName = (term.name || '').toLowerCase();
        var termSlug = (term.slug || '').toLowerCase();
        if (termName.includes(tenpoNorm) || tenpoNorm.includes(termName) ||
            termSlug.includes(tenpoNorm) || tenpoNorm.includes(termSlug)) {
          tShowroomIds.push(term.term_id);
        }
      });
    }
  }

  data._categoryTermIds = tCategoryIds;
  data._areaTermIds = tAreaIds;
  data._showroomTermIds = tShowroomIds;

  if (categorySlugsToSet.length > 0) console.log('  設定予定のexample_category (' + tCategoryIds.length + '件): ' + categorySlugsToSet.join(', '));
  if (areaSlugsToSet.length > 0) console.log('  設定予定のexample_area (' + tAreaIds.length + '件): ' + areaSlugsToSet.join(', '));
  if (tenpoWpName) console.log('  設定予定のexample_showroom (' + tShowroomIds.length + '件): ' + tenpoWpName);

  console.log('  WordPressに下書き投稿中...');
  const wpResult = await createWordPressDraft(data, expandedText, featuredImageId);
  console.log('  下書き作成完了: ' + wpResult.editUrl);

  console.log('  スプレッドシートに記録中...');
  await appendToSheet(data, expandedText, wpResult);
  console.log('  スプレッドシート記録完了');

  return { data, expandedText, wpResult };
}

async function main() {
  console.log('\nKINTONE → WordPress 自動連携スクリプト');
  console.log('==========================================\n');

  const required = ['KINTONE_API_TOKEN', 'ANTHROPIC_API_KEY', 'WP_USERNAME', 'WP_APP_PASSWORD', 'GOOGLE_SHEET_ID'];
  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    if (!process.env[key] || process.env[key].indexOf('ここに') !== -1) {
      console.error('環境変数 ' + key + ' が未設定です。');
      process.exit(1);
    }
  }

  const limit = parseInt(process.argv[2] || '3', 10);
  console.log('KINTONEから最新' + limit + '件を取得中...');
  const records = await getKintoneRecords(limit);

  if (records.length === 0) {
    console.log('処理対象のレコードがありません。');
    process.exit(0);
  }

  console.log('\n処理対象レコード：');
  console.log('------------------------------------------------------------');
  records.forEach(function(record, i) {
    const d = extractRecordData(record);
    const trouble = (d.trouble || '').slice(0, 30);
    console.log((i + 1) + '. [ID:' + d.recordId + '] ' + (d.area || '施工箇所不明') + ' / ' + (d.location || '住所不明'));
    console.log('   悩み: ' + trouble + (trouble.length >= 30 ? '...' : ''));
    console.log('   写真: 施工前' + d.beforeImages.length + '枚 / 中' + d.duringImages.length + '枚 / 後' + d.afterImages.length + '枚');
  });
  console.log('------------------------------------------------------------');
  console.log('\n処理内容:');
  console.log('  1. 画像クレンジング（1200pxリサイズ＋明るさ補正）');
  console.log('  2. Claude APIでテキスト推敲・拡張');
  console.log('  3. WordPressに下書き投稿');
  console.log('  4. スプレッドシートに修正前後テキスト＋URLを記録');

  const answer = await askQuestion('\n処理を開始しますか？ (y/n): ');
  if (answer.toLowerCase() !== 'y') {
    console.log('\nキャンセルしました。');
    process.exit(0);
  }

  console.log('\n処理開始...\n');

  const results = [];
  for (var j = 0; j < records.length; j++) {
    try {
      const result = await processRecord(records[j]);
      results.push({ status: 'success', result: result });
    } catch (err) {
      console.error('エラー: ' + err.message);
      results.push({ status: 'error', error: err.message });
    }
    await sleep(2000);
  }

  console.log('\n==========================================');
  console.log('処理結果');
  const succeeded = results.filter(function(r) { return r.status === 'success'; });
  const failed = results.filter(function(r) { return r.status === 'error'; });
  console.log('成功: ' + succeeded.length + '件 / 失敗: ' + failed.length + '件');
  succeeded.forEach(function(r) {
    console.log('  完了: ' + r.result.expandedText.pageTitle);
    console.log('  URL: ' + r.result.wpResult.editUrl);
  });
  console.log('\n完了！スプレッドシートをご確認ください。');
}

main().catch(function(err) {
  console.error('致命的エラー:', err);
  process.exit(1);
});
