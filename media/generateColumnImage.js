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
 * ぬりべえ（外壁・屋根塗装専門）用 検索クエリマップ
 * 共通CATEGORY_SEARCHには屋内素材を返すカテゴリが含まれるため、
 * nurube は屋外（外壁・屋根）の写真のみを返すように専用マップを使う。
 */
const NURUBE_CATEGORY_SEARCH = [
  { keywords: ['屋根', '瓦', '雨漏り', '雨樋', '棟板金'],          query: 'house roof tiles repair exterior' },
  { keywords: ['軒', '軒天', '破風', '鼻隠し'],                    query: 'house exterior eaves facade' },
  { keywords: ['シーリング', 'コーキング', '目地', '肉痩せ'],     query: 'house exterior wall siding facade caulking' },
  { keywords: ['防水', '雨水', '浸水', '雨漏れ'],                  query: 'house exterior roof waterproof rain' },
  { keywords: ['ひび', 'クラック', '劣化', '剥がれ'],              query: 'house exterior wall crack repair' },
  { keywords: ['庭', 'ウッドデッキ', 'ガーデン', 'カーポート'],   query: 'house garden outdoor exterior' },
  { keywords: ['色', 'カラー', '色見本', 'ツートン', 'デザイン'], query: 'house exterior color residential design' },
  { keywords: ['塗料', 'シリコン', 'フッ素', 'ウレタン', '無機'], query: 'house exterior painting roller' },
  { keywords: ['カビ', '苔', '藻', '汚れ', '黒ずみ', '洗浄'],     query: 'house exterior wall stain cleaning' },
  { keywords: ['補助金', '助成金', '見積', '費用', '相場'],       query: 'house exterior painting residential japan' },
  { keywords: ['断熱', '遮熱', '省エネ', '節電'],                  query: 'house exterior roof insulation paint' },
];

const NURUBE_DEFAULT_QUERY = 'house exterior wall painting residential';

/**
 * estate（中古リノベ）用: 中古住宅 × リノベーション。屋内外どちらも可。
 */
const ESTATE_CATEGORY_SEARCH = [
  { keywords: ['キッチン', '台所', '水回り', 'システムキッチン'],   query: 'kitchen interior renovation modern' },
  { keywords: ['浴室', 'お風呂', 'バスルーム', 'ユニットバス'],     query: 'bathroom renovation interior' },
  { keywords: ['洗面', 'トイレ'],                                   query: 'bathroom vanity interior renovation' },
  { keywords: ['間取り', 'リノベ', 'リフォーム', '内装', '改装'],   query: 'home renovation interior modern open' },
  { keywords: ['断熱', '性能', '耐震', '省エネ'],                   query: 'home renovation construction insulation' },
  { keywords: ['マンション'],                                       query: 'apartment interior renovation modern' },
  { keywords: ['中古', '物件', '購入', '住宅ローン', '費用', '補助金', '相場'], query: 'japanese residential house exterior' },
];
const ESTATE_DEFAULT_QUERY = 'home renovation interior modern japanese';

/**
 * kaitai（解体）用: 解体工事・重機・工事現場。
 */
const KAITAI_CATEGORY_SEARCH = [
  { keywords: ['空き家', '古家', '老朽'],                           query: 'old abandoned house japan' },
  { keywords: ['アスベスト', '安全', '養生'],                       query: 'building demolition safety construction' },
  { keywords: ['廃棄物', '産廃', '処分', 'ゴミ'],                   query: 'construction debris demolition site' },
  { keywords: ['費用', '相場', '見積', '料金', '補助金', '助成金'], query: 'house demolition construction site' },
  { keywords: ['解体', '取り壊し', '取壊し', '撤去', '更地'],       query: 'house demolition excavator construction' },
  { keywords: ['重機', 'ユンボ', '工事'],                           query: 'excavator demolition construction machine' },
];
const KAITAI_DEFAULT_QUERY = 'house demolition excavator construction site';

/**
 * funs-life-home（新築注文住宅）用: 新築の住宅外観/内観。
 * ※貼付モードでは画像生成自体をスキップするため通常は未使用。フォールバック用に定義。
 */
const FUNS_CATEGORY_SEARCH = [
  { keywords: ['間取り', '内装', 'インテリア', 'デザイン'],         query: 'new house interior modern japanese' },
  { keywords: ['キッチン', 'リビング', 'LDK'],                      query: 'modern living room interior new home' },
  { keywords: ['断熱', '気密', '耐震', '性能', '省エネ'],           query: 'new house construction modern japan' },
  { keywords: ['土地', '資金', 'ローン', '費用', '相場'],           query: 'new residential house japan modern' },
];
const FUNS_DEFAULT_QUERY = 'new modern house exterior japan residential';

/**
 * サイトID → 専用検索マップの対応表。
 * ここに無いサイト（jube 等）は共通 CATEGORY_SEARCH を使う。
 */
const SITE_SEARCH_MAPS = {
  nurube:            { list: NURUBE_CATEGORY_SEARCH, def: NURUBE_DEFAULT_QUERY },
  estate:            { list: ESTATE_CATEGORY_SEARCH, def: ESTATE_DEFAULT_QUERY },
  kaitai:            { list: KAITAI_CATEGORY_SEARCH, def: KAITAI_DEFAULT_QUERY },
  'funs-life-home':  { list: FUNS_CATEGORY_SEARCH,   def: FUNS_DEFAULT_QUERY },
};

/**
 * キーワード+サイトからPexels検索クエリを決定する
 * @param {string} keyword
 * @param {string} [siteId]  サイト別の専用マップがあればそれを使う（無ければ共通）
 */
function detectSearchQuery(keyword, siteId) {
  // サイト専用マップ（nurube/estate/kaitai/funs-life-home）
  var siteMap = SITE_SEARCH_MAPS[siteId];
  if (siteMap) {
    if (!keyword) return siteMap.def;
    for (var n = 0; n < siteMap.list.length; n++) {
      var ncat = siteMap.list[n];
      for (var nj = 0; nj < ncat.keywords.length; nj++) {
        if (keyword.includes(ncat.keywords[nj])) {
          console.log('  [コラム画像] (' + siteId + ') カテゴリ検出:"' + ncat.keywords[nj] + '" → "' + ncat.query + '"');
          return ncat.query;
        }
      }
    }
    console.log('  [コラム画像] (' + siteId + ') カテゴリ不明 → デフォルト');
    return siteMap.def;
  }

  // 共通マップ（jube 等）
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
 * 文字の種別を判定（改行位置スコアリング用）
 */
function charClass(ch) {
  if (!ch) return 'other';
  if (/[。、，．！？!?…‥]/.test(ch))            return 'punct'; // 句読点
  if (/[」』】）)］｝〉》’”]/.test(ch))          return 'close'; // 閉じ括弧
  if (/[「『【（(［｛〈《‘“]/.test(ch))          return 'open';  // 開き括弧
  if (/[・･]/.test(ch))                          return 'mid';   // 中黒
  if (/[぀-ゟ]/.test(ch))                return 'hira';  // ひらがな
  if (/[゠-ヿｦ-ﾟー]/.test(ch)) return 'kana'; // カタカナ
  if (/[一-鿿々]/.test(ch))          return 'kanji'; // 漢字
  if (/[0-9０-９]/.test(ch))                      return 'num';
  if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(ch))              return 'latin';
  return 'other';
}

// 助詞（直後が内容語なら自然な句切り）。「や」は語中（〜しやすい等）に多く誤爆するため除外。
var BREAK_PARTICLES = 'のはをがにへともでね';

/**
 * 位置 i の直後（i と i+1 の間）で改行する場合の「自然さスコア」。高いほど良い区切り。
 * 単語の途中（しや|すい 等）で切れないよう、文字種境界を重視する。
 */
function breakScore(s, i) {
  var cur = s[i], next = s[i + 1];
  if (!next) return 0;
  var cc = charClass(cur), nc = charClass(next);

  if (cc === 'punct' || cc === 'mid') return 100; // 句読点・中黒の直後
  if (cc === 'close')                 return 95;  // 閉じ括弧の直後
  if (nc === 'open')                  return 92;  // 開き括弧の直前
  // 助詞の直後＋次が内容語（漢字/カナ/英数）
  if (BREAK_PARTICLES.indexOf(cur) >= 0 && (nc === 'kanji' || nc === 'kana' || nc === 'latin' || nc === 'num')) return 82;

  // 文字種の境界（語境界になりやすい順）
  var key = cc + '>' + nc;
  var T = {
    'hira>kanji': 80, 'hira>kana': 74, 'hira>latin': 72, 'hira>num': 72,
    'kanji>kana': 70, 'kanji>latin': 66, 'kanji>num': 66,
    'kana>kanji': 60, 'num>kanji': 56, 'latin>kanji': 56,
    'num>hira': 40, 'latin>hira': 40, 'kanji>kanji': 36, 'kana>hira': 28,
    'kanji>hira': 16, 'hira>hira': 6,
  };
  return T[key] || 5;
}

/**
 * タイトル文字列を1行あたりmaxChars文字で折り返す。
 * 文字種境界・句読点・助詞をスコアリングし、単語の途中で切れない自然な位置を選ぶ。
 * 同点なら行が長くなる位置（後方）を優先。！？は最優先で直後改行。
 */
function wrapTitle(title, maxChars) {
  var lines = [];
  var remaining = title;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }

    var hi = Math.min(maxChars, remaining.length - 1);
    var lo = Math.max(1, Math.floor(maxChars * 0.45)); // これより短い行は作らない（不自然な短行防止）
    var breakAt = -1;

    // ① ！？は最優先で直後改行（先頭から最初に見つかった位置）
    for (var k = 1; k <= hi; k++) {
      var ch = remaining[k];
      if (ch === '！' || ch === '？' || ch === '!' || ch === '?') { breakAt = k + 1; break; }
    }

    // ② スコア最大の区切り位置を後方優先で選ぶ
    if (breakAt < 0) {
      var bestI = -1, bestScore = -1;
      for (var i = hi; i >= lo; i--) {
        var sc = breakScore(remaining, i);
        if (sc > bestScore) { bestScore = sc; bestI = i; } // 同点は大きいi（長い行）を維持
      }
      breakAt = bestI > 0 ? bestI + 1 : maxChars; // 候補なし=ハードカット
    }

    if (breakAt > maxChars) breakAt = maxChars;
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
  // ｜ はキャッチフレーズと補足の区切り → 改行位置として扱い、フルタイトルを表示する
  var segments = displayTitle.split('｜').map(function(s) { return s.trim(); }).filter(Boolean);
  if (segments.length === 0) segments = [displayTitle];

  var titleLen = displayTitle.replace(/｜/g, '').length;
  // 一覧サムネイル（縮小表示）でも判読できるよう、文字を大きめに設定する。
  // 文字を大きくする分、1行あたりの文字数を減らして行数で吸収する（画像内には収まる）。
  var fontSize, maxCharsPerLine;
  if      (titleLen <= 12) { fontSize = 100; maxCharsPerLine = 10; }
  else if (titleLen <= 20) { fontSize = 90;  maxCharsPerLine = 12; }
  else if (titleLen <= 30) { fontSize = 82;  maxCharsPerLine = 13; }
  else if (titleLen <= 40) { fontSize = 76;  maxCharsPerLine = 15; }
  else                     { fontSize = 68;  maxCharsPerLine = 16; }

  // 各セグメントを折り返し、｜ の位置で必ず改行（フルタイトルを行に展開）
  var lines = [];
  segments.forEach(function(seg) {
    wrapTitle(seg, maxCharsPerLine).forEach(function(l) { lines.push(l); });
  });
  if (lines.length === 0) lines = [displayTitle];

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
 * @param {string} [siteId]  - 'jube' | 'nurube' 等。nurube は屋外写真限定。
 * @returns {Buffer|null}
 */
async function createColumnImage(pageTitle, keyword, siteId) {
  var apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('  [コラム画像] PEXELS_API_KEY が未設定のため自動生成をスキップ');
    return null;
  }

  try {
    // 表示タイトル: フルタイトルを使用（｜は generateTitleImage 側で改行位置として扱う）
    var displayTitle = (pageTitle || '').trim();
    if (!displayTitle) displayTitle = pageTitle || '';

    // 1. カテゴリ + サイトIDから Pexels 検索クエリを決定
    var searchQuery = detectSearchQuery(keyword || pageTitle, siteId);

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

/**
 * タイトル文字を載せない「素の記事写真」をPexelsから取得してJPEGバッファで返す。
 * 非WPサイト（funs-life-home）のセクション写真（写真2・写真3）用。
 *
 * @param {string} keyword - カテゴリ判定用キーワード
 * @param {string} [siteId] - サイト別検索マップの選択に使用
 * @returns {Buffer|null}
 */
async function createPlainColumnPhoto(keyword, siteId) {
  var apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;
  try {
    var searchQuery = detectSearchQuery(keyword, siteId);
    var photoUrl = await fetchPexelsPhotoUrl(searchQuery, apiKey);
    if (!photoUrl) return null;
    var photoBuffer = await downloadBuffer(photoUrl);
    const sharp = require('sharp');
    // 記事内写真は 1200x800 にトリミングして軽く明るさ調整
    return await sharp(photoBuffer)
      .resize(1200, 800, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 1.02 })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.warn('  [記事写真] 取得エラー: ' + err.message);
    return null;
  }
}

// 旧バージョン（重複定義・文字化け・'・・' typo）は削除済み
/* REMOVED_DUPLICATE_START
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

REMOVED_DUPLICATE_END */

module.exports = { createColumnImage, createPlainColumnPhoto, generateTitleImage, wrapTitle };
