require('dotenv').config();
const https = require('https');

async function main() {
  const options = {
    hostname: process.env.KINTONE_SUBDOMAIN + '.cybozu.com',
    path: '/k/v1/records.json?app=' + process.env.KINTONE_APP_ID + '&query=limit+1',
    method: 'GET',
    headers: { 'X-Cybozu-API-Token': process.env.KINTONE_API_TOKEN }
  };

  const data = await new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });

  if (data.records && data.records[0]) {
    const r = data.records[0];
    console.log('KINTONE接続成功！');
    console.log('レコードID:', r['$id']?.value);
    console.log('住所:', r['住所']?.value);
    console.log('施工主様のお悩み:', (r['施工主様のお悩み']?.value || '').slice(0, 40));
    console.log('リフォームのポイント:', (r['リフォームのポイント']?.value || '').slice(0, 40));
    console.log('施工後の写真 枚数:', (r['施工後の写真']?.value || []).length);
    console.log('\n=== テスト完了：WordPressへの投稿は行っていません ===');
  } else {
    console.log('エラー:', JSON.stringify(data));
  }
}

main().catch(console.error);
