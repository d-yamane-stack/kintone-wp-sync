'use strict';

const { extractCity } = require('./extractRecord');

/**
 * ぬりべえ Kintone (App 513) レコード → 内部データ構造 に変換する。
 *
 * Kintone フィールド → WP ACF 対応:
 *   お客様のご要望     → nayami
 *   ご提案内容         → point
 *   お客様の声         → koe
 *   価格帯             → hiyou  (dropdown: "130~150万円" など)
 *   工事期間           → kikan  (dropdown: "約15日間" など)
 *   施工面積           → menseki (text)
 *   メーカー名や商品名  → buzai-wrap repeater (mekar2 / name2)
 *   築_年数           → tiku   (dropdown: "25~30年" など)
 *   担当者から一言     → tantou
 *   作成者             → tantoUser (WPユーザーマッチングに使用)
 *   施工前の写真       → before-main repeater
 *   施工後の写真       → after-main repeater + featured_media
 *   下塗り+養生洗浄+中塗り+上塗り+検査 → under-main repeater (施工中)
 *   集合写真           → syuugou (単一画像)
 */
function extractNurubeRecordData(record) {
  // --- 作成者 (CREATOR型) ---
  var creatorRaw = record['作成者'] && record['作成者'].value;
  var creatorName = '';
  if (creatorRaw && typeof creatorRaw === 'object') {
    creatorName = creatorRaw.name || '';
  } else if (typeof creatorRaw === 'string') {
    creatorName = creatorRaw;
  }

  // --- 施工箇所 (CHECK_BOX型: 複数選択) ---
  var areaVal = record['施工箇所'] && record['施工箇所'].value;
  var area    = Array.isArray(areaVal) ? areaVal.join('・') : (areaVal || '');

  // --- 住所 → 市区町村抽出 ---
  var rawLocation = (record['住所'] && record['住所'].value) || '';

  // --- 施工面積: "施工面積     40坪" → "40坪" に整形 ---
  var mensekiRaw = (record['施工面積'] && record['施工面積'].value) || '';
  var menseki = mensekiRaw.replace(/^施工面積[\s　]+/, '').trim();

  // --- メーカー名や商品名 → buzai-wrap 用に行ごとにパース ---
  // 例: "外壁：大日本塗料 セントップ1フラット/フラント塗料\n屋根：関西ペイント ファインパーフェクトトップ"
  var makerRaw = (record['メーカー名や商品名'] && record['メーカー名や商品名'].value) || '';
  var buzaiItems = parseBuzaiLines(makerRaw);

  // --- 施工中写真: 下塗り + 養生洗浄 + 中塗り + 上塗り + 検査 を合算 ---
  var duringImages = [].concat(
    (record['下塗り']   && record['下塗り'].value)   || [],
    (record['養生洗浄'] && record['養生洗浄'].value) || [],
    (record['中塗り']   && record['中塗り'].value)   || [],
    (record['上塗り']   && record['上塗り'].value)   || [],
    (record['検査']     && record['検査'].value)     || []
  );

  // --- 集合写真 (FILE型: 単一または複数) → 先頭1枚のみ使用 ---
  var syugouFiles = (record['集合写真'] && record['集合写真'].value) || [];
  var syugouImage = syugouFiles.length > 0 ? syugouFiles[0] : null;

  return {
    recordId:     (record['$id'] && record['$id'].value) || '',
    recordNumber: (record['施工事例UPレコード番号'] && record['施工事例UPレコード番号'].value) || '',
    location:     rawLocation,
    city:         extractCity(rawLocation),
    area:         area,
    menseki:      menseki,
    paintType:    (record['塗料種類']    && record['塗料種類'].value)    || '',
    roofType:     (record['屋根種類']    && record['屋根種類'].value)    || '',
    wallType:     (record['外壁種類']    && record['外壁種類'].value)    || '',
    colorPattern: (record['カラーパターン'] && record['カラーパターン'].value) || '',
    cost:         (record['価格帯']      && record['価格帯'].value)      || (record['リフォーム費用'] && record['リフォーム費用'].value) || '',
    period:       (record['工事期間']    && record['工事期間'].value)    || (record['リフォーム期間'] && record['リフォーム期間'].value) || '',
    buildingAge:  (record['築_年数']     && record['築_年数'].value)     || (record['築年数'] && record['築年数'].value) || '',
    trouble:      (record['お客様のご要望'] && record['お客様のご要望'].value) || '',
    reformPoint:  (record['ご提案内容']    && record['ご提案内容'].value) || '',
    customerVoice: (record['お客様の声']   && record['お客様の声'].value) || '',
    tantoMessage: (record['担当者から一言'] && record['担当者から一言'].value) || '',
    tanto:        creatorName,
    tantoUser:    creatorName,
    makerRaw:     makerRaw,
    buzaiItems:   buzaiItems,
    beforeImages: (record['施工前の写真']  && record['施工前の写真'].value) || [],
    afterImages:  (record['施工後の写真']  && record['施工後の写真'].value) || [],
    duringImages: duringImages,
    syugouImage:  syugouImage,
    hpStatus:     (record['ホームページ公開']   && record['ホームページ公開'].value)   || '',
    hpUrl:        (record['ホームページ公開URL'] && record['ホームページ公開URL'].value) || '',
  };
}

/**
 * メーカー名や商品名フィールドを行ごとにパースして buzai-wrap 用配列を返す。
 * 例: "外壁：大日本塗料 セントップ1フラット\n屋根：関西ペイント ファイン..."
 *  → [{ mekar2: "大日本塗料", name2: "外壁：セントップ1フラット" }, ...]
 *
 * ルール:
 *   1. ：の前 → 箇所名（name2 のプレフィクスとして保持）
 *   2. ：の後の最初のスペース前 → メーカー (mekar2)
 *   3. 残り → 商品名 (name2 に箇所名プレフィクス付き)
 */
function parseBuzaiLines(raw) {
  if (!raw) return [];
  var lines = raw.split(/\r?\n/).filter(function(l) { return l.trim(); });
  return lines.map(function(line) {
    var colonIdx = line.indexOf('：');
    if (colonIdx < 0) colonIdx = line.indexOf(':');
    var location = '';
    var rest = line.trim();
    if (colonIdx >= 0) {
      location = line.slice(0, colonIdx).trim();
      rest = line.slice(colonIdx + 1).trim();
    }
    // rest = "大日本塗料 セントップ1フラット" など
    var spaceIdx = rest.search(/[ 　]/);
    var maker    = '';
    var product  = rest;
    if (spaceIdx > 0) {
      maker   = rest.slice(0, spaceIdx).trim();
      product = rest.slice(spaceIdx + 1).trim();
    }
    var name2 = location ? (location + '：' + product) : product;
    return { mekar2: maker, name2: name2 };
  }).filter(function(item) { return item.mekar2 || item.name2; });
}

module.exports = { extractNurubeRecordData };
