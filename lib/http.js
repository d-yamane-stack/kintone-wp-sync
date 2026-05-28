'use strict';

const https = require('https');
const http = require('http');

/**
 * ?rest_route= 形式（パーマリンク非整形のWordPress）のURL正規化。
 * restBase（…?rest_route=/wp/v2/）にエンドポイント（posts?per_page=100 など）を
 * 連結すると ? が二重になるため、2つ目以降の ? を & に変換する。
 * rest_route= を含まない通常URLには一切手を加えない（副作用なし）。
 */
function normalizeRestRouteUrl(u) {
  if (typeof u !== 'string' || u.indexOf('rest_route=') === -1) return u;
  const qIdx = u.indexOf('?');
  if (qIdx === -1) return u;
  return u.slice(0, qIdx + 1) + u.slice(qIdx + 1).replace(/\?/g, '&');
}

function httpRequest(options, body) {
  body = body || null;
  return new Promise(function(resolve, reject) {
    const parsedUrl = new URL(normalizeRestRouteUrl(options.url));
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 120000,
    }, function(res) {
      const chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        const responseBody = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(responseBody.toString())); }
          catch (e) { resolve(responseBody); }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + responseBody.toString()));
        }
      });
    });
    req.on('timeout', function() {
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

function httpRequestBinary(requestUrl, headers) {
  headers = headers || {};
  return new Promise(function(resolve, reject) {
    const parsedUrl = new URL(normalizeRestRouteUrl(requestUrl));
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: headers,
    }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) {
          return reject(new Error('リダイレクトレスポンスにLocationヘッダーがありません'));
        }
        return httpRequestBinary(location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'image/jpeg',
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = function(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); };

module.exports = { httpRequest, httpRequestBinary, sleep };
