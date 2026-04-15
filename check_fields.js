require('dotenv').config();
const https = require('https');

const xml = '<?xml version="1.0"?><methodCall><methodName>wp.getPost</methodName><params>' +
  '<param><value><int>0</int></value></param>' +
  '<param><value><string>' + process.env.WP_USERNAME + '</string></value></param>' +
  '<param><value><string>' + process.env.WP_APP_PASSWORD + '</string></value></param>' +
  '<param><value><int>122258</int></value></param>' +
  '</params></methodCall>';

const body = Buffer.from(xml, 'utf8');
const req = https.request({
  hostname: 'jube.co.jp',
  path: '/refresh2022/xmlrpc.php',
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    'Content-Length': body.length,
  },
}, function(res) {
  let data = '';
  res.on('data', function(c) { data += c; });
  res.on('end', function() {
    // keyとvalueのペアをすべて抽出
    const cfIndex = data.indexOf('custom_fields');
    if (cfIndex === -1) {
      console.log('custom_fieldsが見つかりません');
      return;
    }
    const cfData = data.substring(cfIndex);
    // key名を全部抽出
    const keyMatches = cfData.match(/<key>([^<]+)<\/key>\s*<\/name><\/member>\s*<member><name>value<\/name><value><string>([^<]*)<\/string>/g) || [];
    
    // 別パターンで抽出
    const allKeys = cfData.match(/key<\/name><value><string>([^<]+)<\/string>/g) || [];
    const allVals = cfData.match(/value<\/name><value><string>([^<]*)<\/string>/g) || [];
    
    console.log('=== カスタムフィールド キー一覧 ===');
    allKeys.forEach(function(k, i) {
      const key = k.replace(/key<\/name><value><string>/, '').replace(/<\/string>/, '');
      const val = allVals[i] ? allVals[i].replace(/value<\/name><value><string>/, '').replace(/<\/string>/, '').substring(0, 30) : '';
      if (!key.startsWith('_')) {
        console.log('KEY: ' + key + ' | VAL: ' + val);
      }
    });
  });
});
req.on('error', function(e) { console.error(e); });
req.write(body);
req.end();
