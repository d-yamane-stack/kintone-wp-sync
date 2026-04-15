require('dotenv').config();
const https = require('https');

function xmlRpc(method, params) {
  var paramsXml = params.map(function(p) {
    if (typeof p === 'number') return '<param><value><int>' + p + '</int></value></param>';
    return '<param><value><string>' + p + '</string></value></param>';
  }).join('');
  var xml = '<?xml version="1.0"?><methodCall><methodName>' + method + '</methodName><params>' + paramsXml + '</params></methodCall>';
  var body = Buffer.from(xml, 'utf8');

  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: 'jube.co.jp',
      path: '/refresh2022/xmlrpc.php',
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': body.length },
    }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve(d); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  var u = process.env.WP_USERNAME;
  var p = process.env.WP_APP_PASSWORD;

  // まず利用可能なタクソノミー一覧を取得
  console.log('=== 利用可能なタクソノミー一覧 ===');
  var r = await xmlRpc('wp.getTaxonomies', [0, u, p]);
  // name要素を抽出
  var matches = r.match(/<n>([^<]+)<\/name><\/member><member><n>label<\/name><value><string>([^<]*)<\/string>/g) || [];
  if (matches.length === 0) {
    // 別パターンで抽出
    var nameMatches = r.match(/name<\/name><value><string>([^<]+)<\/string>/g) || [];
    nameMatches.forEach(function(m) {
      var name = m.replace(/name<\/name><value><string>/, '').replace(/<\/string>/, '');
      console.log('  ' + name);
    });
  } else {
    matches.forEach(function(m) { console.log(m); });
  }
  
  // RAWも少し表示
  console.log('\n=== RAW（最初の2000文字）===');
  console.log(r.substring(0, 2000));
}

main().catch(console.error);
