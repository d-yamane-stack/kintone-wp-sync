'use strict';

const https = require('https');
const http  = require('http');

/**
 * リフォーム部位キーワード → Pexels検索クエリ マッピング
 */
const CATEGORY_SEARCH = [
  { keywords: ['キッチン', '台所', 'IH', 'システムキッチン'],  query: 'kitchen interior renovation modern' },
  { keywords: ['浴室', 'お風呂', 'バスルーム', 'ユニットバス'], query: 'bathroom renovation interior luxury' },
  { keywords: ['トイレ', '便器', '洗浄'],                       query: 'toilet bathroom white clean interior' },
  { keywords: ['洗面', '洗面台', '洗面所'],                     query: 'bathroom vanity sink interior' },
  { keywords: ['外壁', '外観', '塗装', 'サイディング'],         query: 'house exterior wall renovation' },
  { keywords: ['屋根', '雨漏り', '雨樋'],                       query: 'house roof tiles repair' },
  { keywords: ['窓', 'サッシ', '二重窓', '断熱窓'],            query: 'window interior room natural light' },
  { keywords: ['フローリング', '床材', '床', '畳'],             query: 'wood floor interior room renovation' },
  { keywords: ['リビング', 'LDK', '居間'],                      query: 'living room interior cozy renovation' },
  { keywords: ['玄関', '扉', 'ドア'],                           query: 'entrance hallway interior home' },
  { keywords: ['収納', 'クローゼット', '押入れ'],               query: 'closet storage interior organized' },
  { keywords: ['増築', '改築', 'リノベーション', '全面'],       query: 'home renovation construction interior' },
  { keywords: ['断熱', '省エネ', '節電'],                       query: 'home insulation energy saving renovation' },
  { keywords: ['カビ', '湿気', '結露'],                         query: 'home moisture humidity problem renovation' },
  { keywords: ['庭', 'ウッドデッキ', 'ガーデン'],              query: 'garden wood deck outdoor home' },
  { keywords: ['シーリング', 'コーキング', '目地', '肉痩せ'], query: 'house exterior wall siding facade' },
  { keywords: ['防水', '雨水', '浸水', '雨漏れ'],             query: 'house exterior roof waterproof rain' },
  { keywords: ['軒', '軒天', '破風'],                          query: 'house exterior eaves facade japan' },
  { keywords: ['ひび', 'クラック', '劣化'],                   query: 'house exterior wall repair renovation' },
  { keywords: ['塗り替え', '重ね塗り', '下塗り', '中塗り', '上塗り'], query: 'house exterior painting renovation' },
];

const DEFAULT_QUERY = 'house exterior facade japan residential';

/**
 * キーワードからPexels検索クエリを決定する
 */
function detectSearchQuery(keyword) {
  if (!keyword) return DEFAULT_QUERY;
  for (var i = 0; i < CATEGORY_SEARCH.length; i++) {
    var cat = CATEGORY_SEARCH[i];
    for (var j = 0; j < cat.keywords.length; j++) {
      if (keyword.includes(cat.keywords[j])) {
        console.log('  [コラム画像] カテゴリ検出:"' + cat.keywords[j] + '" → "' + cat.query + '"');
        return cat.query;
      }
    }
  }
  console.log('  [コラム画像] カテゴリ不明 → デフォルト検索');
  return DEFAULT_QUERY;
}

/**
 * Pexels APIで写真URLを取得する（ランダム選択でバリエーション確保）
 */
async function fetchPexelsPhotoUrl(searchQuery, apiKey) {
  return new Promise(function(resolve, reject) {
    var url = 'https://api.pexels.com/v1/search?query='
      + encodeURIComponent(searchQuery)
      + '&per_page=15&orientation=landscape';
    var req = https.get(url, { headers: { 'Authorization': apiKey } }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(data);
          if (json.photos && json.photos.length > 0) {
            // 先頭10枚からランダム選択（同日UPでの重複を回避）
            var pool = json.photos.slice(0, Math.min(10, json.photos.length));
            var photo = pool[Math.floor(Math.random() * pool.length)];
            resolve(photo.src.large2x || photo.src.large);
          } else {
            resolve(null);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function() { req.destroy(new Error('Pexels APIタイムアウト')); });
  });
}

/**
 * URLから画像バッファをダウンロード（リダイレクト対応）
 */
async function downloadBuffer(url, depth) {
  depth = depth || 0;
  if (depth > 5) throw new Error('リダイレクトが多すぎます');
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    lib.get(url, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return downloadBuffer(res.headers.location, depth + 1).then(resolve).catch(reject);
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve(Buffer.concat(chunks)); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * タイトル文字列を1行あたりmaxChars文字で折り返す
 * 優先順位: 句読点・助詞の直後 > 「の直前 > 強制カット
 * 「補助金」などの括弧内を途中で切らないよう配慮
 */
function wrapTitle(title, maxChars) {
  // 直後で切れる文字（句読点・助詞・接続詞など）
  var afterChars  = ['。', '、', '！', '？', '」', '』', '】', '・',
                     'で', 'に', 'を', 'が', 'は', 'も', 'と', 'の', 'へ', 'や'];
  // 直前で切る文字（開き括弧）
  var beforeChars = ['「', '『', '【', '（', '('];
  // 最優先で改行する文字（位置によらず必ず直後で折り返す）
  var forcedBreakChars = ['！', '？'];

  var lines = [];
  var remaining = title;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }

    var best = -1;

    // ① まず！？を先頭から maxChars 以内で探す（最優先）
    for (var k = 1; k <= Math.min(maxChars, remaining.length - 1); k++) {
      if (forcedBreakChars.indexOf(remaining[k]) >= 0) {
        best = k + 1;
        break;
      }
    }

    // ② 見つからなければ通常の後方探索
    if (best < 0) {
      for (var i = Math.min(maxChars, remaining.length - 1); i >= Math.floor(maxChars * 0.5); i--) {
        // 次の文字が開き括弧 → ここで切る（括弧の直前）
        if (i < remaining.length - 1 && beforeChars.indexOf(remaining[i + 1]) >= 0) {
          best = i + 1;
          break;
        }
        // この文字の直後で切れる
        if (afterChars.indexOf(remaining[i]) >= 0) {
          best = i + 1;
          break;
        }
      }
    }

    var breakAt = best > 0 ? best : maxChars;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  return lines;
}

function escSvg(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 写真バッファ + タイトル文字列 → コラム画像バッファ（JPEG）を生成する
 * レイアウト: 写真を全面にリサイズ → 半透明オーバーレイ → 白枠 → 中央タイトルテキスト
 */
async function generateTitleImage(photoBuffer, displayTitle) {
  const sharp = require('sharp');

  const W = 1200;
  const H = 800;

  // ---- 1. ベース写真: リサイズ + 明るさ調整（文字が見やすい程度に）----
  const baseBuffer = await sharp(photoBuffer)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.88 })
    .toBuffer();

  // ---- 2. テキスト折り返し（タイトル長に応じてフォントサイズと折り返し幅を動的調整）----
  // 使用可能幅 1100px / フォントサイズ ≈ 1文字の幅
  var titleLen = displayTitle.length;
  var fontSize, maxCharsPerLine;
  if      (titleLen <= 10) { fontSize = 80; maxCharsPerLine = 13; }
  else if (titleLen <= 16) { fontSize = 70; maxCharsPerLine = 15; }
  else if (titleLen <= 24) { fontSize = 62; maxCharsPerLine = 17; }
  else if (titleLen <= 32) { fontSize = 54; maxCharsPerLine = 19; }
  else                     { fontSize = 48; maxCharsPerLine = 22; }

  var lines = wrapTitle(displayTitle, maxCharsPerLine);
  var lineH    = Math.round(fontSize * 1.38);
  var totalH   = lines.length * lineH;
  // テキストブロックを縦中央に配置
  var baselineY = Math.round((H - totalH) / 2) + Math.round(lineH * 0.78);

  // ---- 3. SVGオーバーレイ: 白枠 + 各行テキスト（影付き白文字）----
  var textSvgLines = lines.map(function(line, idx) {
    var y = baselineY + idx * lineH;
    // 影（暗色オフセット）
    var shadow = '<text'
      + ' x="50%"'
      + ' y="' + (y + 4) + '"'
      + ' text-anchor="middle"'
      + ' font-family="\'Meiryo UI\',\'Meiryo\',\'Yu Gothic UI\',\'Yu Gothic\',\'MS Gothic\',sans-serif"'
      + ' font-size="' + fontSize + '"'
      + ' font-weight="bold"'
      + ' fill="rgba(0,0,0,0.75)">'
      + escSvg(line)
      + '</text>';
    // 本文（白）
    var main = '<text'
      + ' x="50%"'
      + ' y="' + y + '"'
      + ' text-anchor="middle"'
      + ' font-family="\'Meiryo UI\',\'Meiryo\',\'Yu Gothic UI\',\'Yu Gothic\',\'MS Gothic\',sans-serif"'
      + ' font-size="' + fontSize + '"'
      + ' font-weight="bold"'
      + ' fill="white">'
      + escSvg(line)
      + '</text>';
    return shadow + main;
  }).join('\n');

  var svgOverlay = Buffer.from(
    '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">'
    // 半透明黒オーバーレイ（テキスト視認性確保・薄め）
    + '<rect width="' + W + '" height="' + H + '" fill="rgba(0,0,0,0.15)"/>'
    // 白枠（内側）
    + '<rect x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '"'
    + ' fill="none" stroke="white" stroke-width="2.5"/>'
    // テキスト行
    + textSvgLines
    + '</svg>'
  );

  // ---- 4. 合成 → JPEG ----
  return sharp(baseBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/**
 * コラム画像を完全自動生成してバッファで返すメイン関数
 *
 * @param {string} pageTitle - 生成されたコラムタイトル
 * @param {string} keyword   - 元のキーワード（カテゴリ判定用）
 * @returns {Buffer|null}
 */
async function createColumnImage(pageTitle, keyword) {
  var apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('  [コラム画像] PEXELS_API_KEY が未設定のため自動生成をスキップ');
    return null;
  }

  try {
    // 表示タイトル: ｜より前のキャッチフレーズのみ
    var displayTitle = (pageTitle || '').split('｜')[0].trim();
    if (!displayTitle) displayTitle = pageTitle || '';

    // 1. カテゴリからPexels検索クエリを決定
    var searchQuery = detectSearchQuery(keyword || pageTitle);

    // 2. Pexelsから写真URL取得
    console.log('  [コラム画像] Pexels検索中: "' + searchQuery + '"');
    var photoUrl = await fetchPexelsPhotoUrl(searchQuery, apiKey);
    if (!photoUrl) {
      console.warn('  [コラム画像] Pexelsで写真が見つかりませんでした');
      return null;
    }

    // 3. 写真ダウンロード
    console.log('  [コラム画像] 写真ダウンロード中...');
    var photoBuffer = await downloadBuffer(photoUrl);

    // 4. タイトル画像合成
    console.log('  [コラム画像] タイトル合成中: "' + displayTitle + '"');
    var imageBuffer = await generateTitleImage(photoBuffer, displayTitle);
    console.log('  [コラム画像] 生成完了 (' + Math.round(imageBuffer.length / 1024) + 'KB)');

    return imageBuffer;
  } catch (err) {
    console.warn('  [コラム画像] 生成エラー: ' + err.message);
    return null;
  }
}

async function createColumnImage(pageTitle, keyword, referenceImageUrls) {
  var apiKey = process.env.PEXELS_API_KEY;

  try {
    var displayTitle = (pageTitle || '').split('・・')[0].trim();
    if (!displayTitle) displayTitle = pageTitle || '';

    var photoUrl = null;
    if (Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0) {
      var pool = referenceImageUrls.slice(0, Math.min(8, referenceImageUrls.length));
      photoUrl = pool[Math.floor(Math.random() * pool.length)];
      console.log('  [繧ｳ繝ｩ繝逕ｻ蜒従 WP蜈ｬ髢九う繝｡繝ｼ繧ｸ繧定ｦｪ謨・ ' + pool.length + '莉ｶ');
    }

    if (!photoUrl && apiKey) {
      var searchQuery = detectSearchQuery(keyword || pageTitle);
      console.log('  [繧ｳ繝ｩ繝逕ｻ蜒従 Pexels讀懃ｴ｢荳ｭ: "' + searchQuery + '"');
      photoUrl = await fetchPexelsPhotoUrl(searchQuery, apiKey);
    }

    if (!photoUrl) {
      console.warn('  [繧ｳ繝ｩ繝逕ｻ蜒従 蜿門ｾ励〒縺阪ｋ蜀咏悄縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ');
      return null;
    }

    console.log('  [繧ｳ繝ｩ繝逕ｻ蜒従 蜀咏悄繝繧ｦ繝ｳ繝ｭ繝ｼ繝我ｸｭ...');
    var photoBuffer = await downloadBuffer(photoUrl);

    console.log('  [繧ｳ繝ｩ繝逕ｻ蜒従 繧ｿ繧､繝医Ν蜷域・荳ｭ: "' + displayTitle + '"');
    var imageBuffer = await generateTitleImage(photoBuffer, displayTitle);
    console.log('  [繧ｳ繝ｩ繝逕ｻ蜒従 逕滓・螳御ｺ・(' + Math.round(imageBuffer.length / 1024) + 'KB)');

    return imageBuffer;
  } catch (err) {
    console.warn('  [繧ｳ繝ｩ繝逕ｻ蜒従 逕滓・繧ｨ繝ｩ繝ｼ: ' + err.message);
    return null;
  }
}

module.exports = { createColumnImage };
