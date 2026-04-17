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
 * Claude が出力したメーカー名を許容リストと照合して正式値を返す。
 * @param {string} name
 * @param {string[]} [list] - サイト別リスト。省略時はグローバルMAKER_LIST
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
 * @param {string} name
 * @param {string[]} [list] - サイト別リスト。省略時はグローバルTENPO_LIST
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

module.exports = { extractRecordData, matchMakerName, matchTenpoName, extractCity };
