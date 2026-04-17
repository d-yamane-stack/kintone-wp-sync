'use strict';

const { CONFIG } = require('../config');
const { httpRequest, httpRequestBinary } = require('../lib/http');

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

module.exports = { getKintoneRecords, downloadKintoneImage };
