'use strict';

const { CONFIG } = require('../config');
const { httpRequest, httpRequestBinary } = require('../lib/http');

// ぬりべえ Kintone 設定
const NURUBE_SUBDOMAIN  = process.env.KINTONE_SUBDOMAIN || 'housing-jube'; // 同一サブドメイン
const NURUBE_APP_ID     = process.env.NURUBE_KINTONE_APP_ID  || '513';
const NURUBE_API_TOKEN  = process.env.NURUBE_KINTONE_API_TOKEN || '';

async function getKintoneRecords(limit, offset) {
  offset = offset || 0;
  const query = encodeURIComponent('order by $id desc limit ' + limit + ' offset ' + offset);
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

/**
 * 指定したレコードIDの配列でKINTONEからレコードを取得する
 * @param {string[]} ids - レコードIDの配列
 */
async function getKintoneRecordsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const query = encodeURIComponent('$id in (' + ids.join(',') + ') limit ' + ids.length);
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

/**
 * 最新N件のプレビュー情報（表示用の最小フィールドのみ）を取得する
 * @param {number} limit
 */
async function getKintoneRecordsPreview(limit) {
  var n = limit || 20;
  var fields = [
    'fields[0]=$id',
    'fields[1]=施工事例UPレコード番号',
    'fields[2]=作成日時',
    'fields[3]=作成者',
    'fields[4]=施工箇所',
    'fields[5]=ホームページ公開',
    'fields[6]=ホームページ公開URL',
  ].join('&');
  const query = encodeURIComponent('order by $id desc limit ' + n);
  const result = await httpRequest({
    url: 'https://' + CONFIG.kintone.subdomain + '.cybozu.com/k/v1/records.json?app=' + CONFIG.kintone.appId + '&query=' + query + '&' + fields,
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': CONFIG.kintone.apiToken },
  });
  if (!result || !Array.isArray(result.records)) {
    throw new Error('KINTONEプレビュー取得エラー: ' + JSON.stringify(result).substring(0, 200));
  }
  return result.records.map(function(r) {
    var areaVal = r['施工箇所'] && r['施工箇所'].value;
    var area = Array.isArray(areaVal) ? areaVal.join('、') : (areaVal || '');
    var creatorVal = r['作成者'] && r['作成者'].value;
    var creator = creatorVal && typeof creatorVal === 'object' ? (creatorVal.name || '') : (creatorVal || '');
    return {
      id:           (r['$id']           && r['$id'].value)                       || '',
      recordNumber: (r['施工事例UPレコード番号'] && r['施工事例UPレコード番号'].value) || '',
      createdAt:    (r['作成日時'] && r['作成日時'].value)                         || '',
      creator:      creator,
      area:         area,
      hpStatus:     (r['ホームページ公開'] && r['ホームページ公開'].value)          || '',
      hpUrl:        (r['ホームページ公開URL'] && r['ホームページ公開URL'].value)    || '',
    };
  });
}

async function downloadKintoneImage(fileKey, apiToken) {
  var token = apiToken || CONFIG.kintone.apiToken;
  return httpRequestBinary(
    'https://' + CONFIG.kintone.subdomain + '.cybozu.com/k/v1/file.json?fileKey=' + fileKey,
    { 'X-Cybozu-API-Token': token }
  );
}

// -----------------------------------------------------------------------
// ぬりべえ専用 (Kintone App 513)
// -----------------------------------------------------------------------

async function getNurubeKintoneRecords(limit, offset) {
  offset = offset || 0;
  var query = encodeURIComponent('order by $id desc limit ' + limit + ' offset ' + offset);
  var result = await httpRequest({
    url: 'https://' + NURUBE_SUBDOMAIN + '.cybozu.com/k/v1/records.json?app=' + NURUBE_APP_ID + '&query=' + query,
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': NURUBE_API_TOKEN },
  });
  if (!result || !Array.isArray(result.records)) {
    throw new Error('KINTONE(ぬりべえ)からのレスポンスが不正です: ' + JSON.stringify(result).substring(0, 200));
  }
  return result.records;
}

async function getNurubeKintoneRecordsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  var query = encodeURIComponent('$id in (' + ids.join(',') + ') limit ' + ids.length);
  var result = await httpRequest({
    url: 'https://' + NURUBE_SUBDOMAIN + '.cybozu.com/k/v1/records.json?app=' + NURUBE_APP_ID + '&query=' + query,
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': NURUBE_API_TOKEN },
  });
  if (!result || !Array.isArray(result.records)) {
    throw new Error('KINTONE(ぬりべえ)からのレスポンスが不正です: ' + JSON.stringify(result).substring(0, 200));
  }
  return result.records;
}

/**
 * ぬりべえ施工事例の最新N件プレビュー情報を取得
 * @param {number} limit
 */
async function getNurubeKintoneRecordsPreview(limit) {
  var n = limit || 20;
  var fields = [
    'fields[0]=$id',
    'fields[1]=施工事例UPレコード番号',
    'fields[2]=作成日時',
    'fields[3]=作成者',
    'fields[4]=施工箇所',
    'fields[5]=住所',
    'fields[6]=ホームページ公開',
    'fields[7]=ホームページ公開URL',
  ].join('&');
  var query = encodeURIComponent('order by $id desc limit ' + n);
  var result = await httpRequest({
    url: 'https://' + NURUBE_SUBDOMAIN + '.cybozu.com/k/v1/records.json?app=' + NURUBE_APP_ID + '&query=' + query + '&' + fields,
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': NURUBE_API_TOKEN },
  });
  if (!result || !Array.isArray(result.records)) {
    throw new Error('KINTONEプレビュー取得エラー(ぬりべえ): ' + JSON.stringify(result).substring(0, 200));
  }
  return result.records.map(function(r) {
    var areaVal = r['施工箇所'] && r['施工箇所'].value;
    var area    = Array.isArray(areaVal) ? areaVal.join('・') : (areaVal || '');
    var creatorVal = r['作成者'] && r['作成者'].value;
    var creator    = creatorVal && typeof creatorVal === 'object' ? (creatorVal.name || '') : (creatorVal || '');
    return {
      id:           (r['$id']                  && r['$id'].value)                       || '',
      recordNumber: (r['施工事例UPレコード番号'] && r['施工事例UPレコード番号'].value) || '',
      createdAt:    (r['作成日時']               && r['作成日時'].value)                 || '',
      creator:      creator,
      area:         area,
      address:      (r['住所']                   && r['住所'].value)                     || '',
      hpStatus:     (r['ホームページ公開']         && r['ホームページ公開'].value)        || '',
      hpUrl:        (r['ホームページ公開URL']       && r['ホームページ公開URL'].value)    || '',
    };
  });
}

module.exports = {
  getKintoneRecords,
  getKintoneRecordsByIds,
  getKintoneRecordsPreview,
  downloadKintoneImage,
  getNurubeKintoneRecords,
  getNurubeKintoneRecordsByIds,
  getNurubeKintoneRecordsPreview,
};
