'use strict';

require('dotenv').config();

/**
 * 蜈ｱ騾夊ｨｭ螳夲ｼ亥・繧ｵ繧､繝亥・譛会ｼ・
 * WordPress險ｭ螳壹・繧ｵ繧､繝亥挨縺ｮ縺溘ａ sites/siteConfigs.js 縺ｧ螳夂ｾｩ縺吶ｋ縲・
 */
const CONFIG = {
  kintone: {
    subdomain: process.env.KINTONE_SUBDOMAIN,
    appId: process.env.KINTONE_APP_ID,
    apiToken: process.env.KINTONE_API_TOKEN,
  },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    credentialsPath: './credentials.json',
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  },
  image: { maxWidth: 1200, brightness: 1.08, contrast: 1.10, quality: 88 },
};

const CATEGORY_MAP = {
  '繧ｭ繝・メ繝ｳ': 'kitchen',
  '豬ｴ螳､': 'bath',
  '豢鈴擇蛹也ｲｧ蜿ｰ': 'washroom',
  '繝医う繝ｬ': 'toilet',
  '遯薙・邇・未': 'entrance',
  '蜀・｣・': 'interior',
  '螟冶ｦｳ': 'exterior',
  '蟆丞ｷ･莠・': 'detail',
  'LDK': 'ldk',
  '蠅玲隼遽・': 'reconstruction',
};

const AREA_MAP = {
  '菴仙牙ｸ・': 'sakura',
  '蜈ｫ陦怜ｸ・': 'yachimata',
  '蛹晉袖蟶・': 'sosa',
  '蜊・痩蟶・': 'chiba',
  '蜊ｰ譌幃Γ': 'inba',
  '蜊ｰ隘ｿ蟶・': 'inzai',
  '蝗幄｡鈴％蟶・': 'yotsukaido',
  '螟ｧ邯ｲ逋ｽ驥悟ｸ・': 'oamishirasato',
  '蟇碁㈹蟶・': 'tomisato',
  '螻ｱ豁ｦ蟶・': 'sanmu',
  '螻ｱ豁ｦ驛｡': 'sanmu',
  '謌千伐蟶・': 'narita',
  '謌大ｭｫ蟄仙ｸ・': 'abiko',
  '譌ｭ蟶・': 'asahi',
  '譚ｱ驥大ｸ・': 'togane',
  '譚ｾ謌ｸ蟶・': 'matsudo',
  '譟丞ｸ・': 'kashiwa',
  '豬∝ｱｱ蟶・': 'nagareyama',
  '闊ｹ讖句ｸ・': 'funabashi',
  '闌ょ次蟶・': 'mobara',
  '驫壼ｭ仙ｸ・': 'choshi',
  '髟ｷ逕滄Γ': 'chosei',
  '鬥吝叙驛｡': 'katori',
  '鬥吝叙蟶・': 'katori',
  '縺､縺上・縺ｿ繧峨＞蟶・': 'tsukubamirai',
  '縺､縺上・蟶・': 'tsukuba',
  '縺ｲ縺溘■縺ｪ縺句ｸ・': 'hitachinaka',
  '蜿匁焔蟶・': 'toride',
  '蝨滓ｵｦ蟶・': 'tsuchiura',
  '螳郁ｰｷ蟶・': 'moriya',
  '蟶ｸ邱丞ｸ・': 'joso',
  '譌･遶句ｸ・': 'hitachi',
  '譚ｱ闌ｨ蝓朱Γ': 'higashiibaraki',
  '豌ｴ謌ｸ蟶・': 'mito',
  '貎ｮ譚･蟶・': 'itako',
  '迚帑ｹ・ｸ・': 'ushiku',
  '逾樊門ｸ・': 'kamisu',
  '遞ｲ謨ｷ蟶・': 'inashiki',
  '遞ｲ謨ｷ驛｡': 'inashiki',
  '陦梧婿蟶・': 'namegata',
  '驍｣迴ょｸ・': 'naka',
  '驩ｾ逕ｰ蟶・': 'hokota',
  '髦ｿ隕狗伴': 'ami',
  '鮖ｿ蠍句ｸ・': 'kashima',
  '鮴阪こ蟠主ｸ・': 'ryugasaki',
};

const MAKER_LIST = [
  'LIXIL',
  'TOTO',
  '繝代リ繧ｽ繝九ャ繧ｯ',
  '繧ｯ繝ｪ繝翫ャ繝・',
  '繧ｿ繧ｫ繝ｩ繧ｹ繧ｿ繝ｳ繝繝ｼ繝・',
  'TOCLAS',
  'FIRST PLUS',
  'WOODONE',
  '繧ｨ繧､繝繧､',
  '繝弱・繝ｪ繝・',
  '繝上え繧ｸ繝ｳ繧ｰ驥榊・陦帷音蛻･莉墓ｧ・',
];

const TENPO_LIST = [
  '譛ｬ遉ｾ・域・逕ｰ繧ｷ繝ｧ繝ｼ繝ｫ繝ｼ繝・・',
  '蜊・痩闍･闡峨す繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
  '譌ｭ繝ｻ譚ｱ邱丞ｺ・',
  '繝代Ν繝顔ｨｲ謨ｷ繝ｻ菴仙次繧ｷ繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
  '鮖ｿ蠍九・逾樊門ｺ・',
  '迚帑ｹ・・鮴阪Ω蟠弱・髦ｿ隕句ｺ・',
  '菴仙峨す繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
  '譟上す繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
  '譚ｱ驥代す繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
  '闌ｨ蝓取悽蠎励・豌ｴ謌ｸ繧ｷ繝ｧ繝ｼ繝ｫ繝ｼ繝',
  '蜿匁焔繝ｻ螳郁ｰｷ繧ｷ繝ｧ繝ｼ繝ｫ繝ｼ繝蠎・',
];

module.exports = { CONFIG, CATEGORY_MAP, AREA_MAP, MAKER_LIST, TENPO_LIST };


