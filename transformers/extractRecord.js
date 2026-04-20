'use strict';

const { MAKER_LIST, TENPO_LIST } = require('../config');

function extractCity(address) {
  if (!address) return '';
  var prefMatch = address.match(/^(東京都|北海道|(?:大阪|京都)府|.{2,3}県)/);
  var pref = prefMatch ? prefMatch[1] : '';
  var rest = address.slice(pref.length);
  var cityMatch = rest.match(/^.{1,5}?(?:市|区|町|村)/);
  if (cityMatch) return pref + cityMatch[0];
  return pref || address;
}

/**
 * 1行目から商品名とメーカー名を抽出する。
 * ルール: 「リフォーム部位」と「メーカー名」を除いた残りが商品名。
 *   例) "床材：LIXIL リノバうわばReフロア"
 *       → 部位"床材"除去 → "LIXIL リノバうわばReフロア"
 *       → メーカー"LIXIL"除去 → 商品名"リノバうわばReフロア"
 */
function parseFirstLineProduct(makerRaw, makerList) {
  if (!makerRaw) return { maker: '', product: '' };
  var firstLine = makerRaw.split(/\r?\n/)[0].trim();
  if (!firstLine) return { maker: '', product: '' };

  var list = makerList || MAKER_LIST;

  // ① リフォーム部位を除去（：の前の部分）
  var work = firstLine;
  var colonIdx = work.indexOf('：');
  if (colonIdx >= 0) {
    work = work.slice(colonIdx + 1).trim();
  } else {
    // 「箇所　残り」形式: 最初の全角スペースまでを部位とみなす
    var spaceIdx = work.indexOf('　');
    if (spaceIdx >= 0) work = work.slice(spaceIdx + 1).trim();
  }

  // ② MAKER_LISTのメーカー名を除去し、残りを商品名とする
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    var idx = work.indexOf(m);
    if (idx >= 0) {
      var product = work.slice(idx + m.length).replace(/^[ 　]+/, '').trim();
      return { maker: m, product: product };
    }
  }

  // ③ MAKER_LISTにない場合: 先頭トークンをメーカー、残りを商品名とする
  var sp = work.search(/[ 　]/);
  if (sp > 0) {
    return { maker: work.slice(0, sp).trim(), product: work.slice(sp + 1).trim() };
  }

  return { maker: work, product: '' };
}

/**
 * Claude が出力したメーカー名を許容リストと照合して正式値を返す。
 */
function matchMakerName(name, list) {
  if (!name) return '';
  var makerList = list || MAKER_LIST;
  var normalized = name.trim().toLowerCase().replace(/[ａ-ｚ]/g, function(c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
  for (var i = 0; i < makerList.length; i++) {
    var cand = makerList[i].toLowerCase().replace(/[ａ-ｚ]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    if (normalized === cand || normalized.includes(cand) || cand.includes(normalized)) {
      return makerList[i];
    }
  }
  return '';
}

/**
 * Kintoneの店舗選択値をリストと部分一致で照合する。
 */
function matchTenpoName(name, list) {
  if (!name) return '';
  var tenpoList = list || TENPO_LIST;
  var normalized = name.trim();
  for (var i = 0; i < tenpoList.length; i++) {
    if (normalized === tenpoList[i]) return tenpoList[i];
  }
  for (var j = 0; j < tenpoList.length; j++) {
    if (normalized.includes(tenpoList[j]) || tenpoList[j].includes(normalized)) {
      return tenpoList[j];
    }
  }
  return '';
}

/**
 * WP担当者ユーザー一覧から最適なエントリを選ぶ。
 * choices: [{ value, slug, jaName }]
 * kintoneNameStr: 作成者の表示名（例: "山﨑　ちはる"）
 */
function matchTantoChoice(kintoneNameStr, choices) {
  if (!kintoneNameStr || !choices || choices.length === 0) return '';

  // NFKC正規化: 﨑(U+FA11互換文字) → 崎(U+5D0E標準文字) などを統一
  var norm = function(s) {
    return (s || '').normalize('NFKC').replace(/[\s　]/g, '');
  };
  var sortChars = function(s) { return s.split('').sort().join(''); };
  var kintoneNorm = norm(kintoneNameStr);
  var kintoneChars = sortChars(kintoneNorm);

  // 1. 完全一致（NFKC正規化 + スペース除去）
  for (var i = 0; i < choices.length; i++) {
    if (norm(choices[i].jaName) === kintoneNorm) return choices[i].value;
  }
  // 2. 文字セット一致（苗字・名前の順序違いを吸収）
  for (var j = 0; j < choices.length; j++) {
    if (sortChars(norm(choices[j].jaName)) === kintoneChars) return choices[j].value;
  }
  // 3. 部分一致: Kintone名の先頭2文字（苗字）がWP名に含まれる
  var surname = kintoneNorm.slice(0, 2);
  if (surname.length >= 2) {
    for (var k = 0; k < choices.length; k++) {
      if (norm(choices[k].jaName).includes(surname)) return choices[k].value;
    }
  }
  return '';
}

function extractRecordData(record) {
  const areaValue = record['施工箇所'] && record['施工箇所'].value;
  const area = Array.isArray(areaValue) ? areaValue.join('、') : (areaValue || '');
  const rawArea = Array.isArray(areaValue) ? areaValue : (areaValue ? [areaValue] : []);
  const rawLocation = (record['住所'] && record['住所'].value) || '';
  const tenpoRaw = record['店舗選択'] && record['店舗選択'].value;

  // 担当者 = Kintoneの「作成者」フィールド（フィールドコード: 作成者）
  const tantoRaw = record['作成者'] && record['作成者'].value;
  var tantoName = '';
  if (tantoRaw && typeof tantoRaw === 'object') {
    tantoName = tantoRaw.name || '';
  } else if (typeof tantoRaw === 'string') {
    tantoName = tantoRaw;
  }

  var makerRaw = (record['メーカー名や商品名'] && record['メーカー名や商品名'].value) || '';
  var parsed = parseFirstLineProduct(makerRaw);

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
    makerRaw: makerRaw,
    firstLineMaker: parsed.maker,
    firstLineProduct: parsed.product,
    menseki: (record['施工面積'] && record['施工面積'].value) || '',
    buildingAge: (record['築年数'] && record['築年数'].value) || '',
    tantoMessage: (record['担当者から一言'] && record['担当者から一言'].value) || '',
    tanto: tantoName,
    tantoUser: tantoName,  // 作成者の名前をWPユーザーマッチングに使用
    tenpo: Array.isArray(tenpoRaw) ? tenpoRaw.join('、') : (tenpoRaw || ''),
    beforeImages: (record['施工前の写真'] && record['施工前の写真'].value) || [],
    duringImages: (record['施工中の写真'] && record['施工中の写真'].value) || [],
    afterImages: (record['施工後の写真'] && record['施工後の写真'].value) || [],
  };
}

module.exports = { extractRecordData, matchMakerName, matchTenpoName, matchTantoChoice, extractCity };
