'use strict';

require('dotenv').config();

/**
 * 共通設定（全サイト共通のデフォルトとして利用）
 * WordPress設定はサイト別のため sites/siteConfigs.js で定義する。
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

// Kintone 施工箇所 → WP example_category スラッグ
const CATEGORY_MAP = {
  'キッチン':   'kitchen',
  '浴室':       'bath',
  '洗面化粧台': 'washroom',
  'トイレ':     'toilet',
  '玄関・廊下': 'entrance',
  '内装':       'interior',
  '外装':       'exterior',
  '細部工事':   'detail',
  'LDK':        'ldk',
  '建替工事':   'reconstruction',
};

// 住所キーワード → WP example_area スラッグ（前方一致優先）
const AREA_MAP = {
  // 千葉県
  '佐倉市':       'sakura',
  '八街市':       'yachimata',
  '匝瑳市':       'sosa',
  '千葉市':       'chiba',
  '印旛郡':       'inba',
  '印西市':       'inzai',
  '四街道市':     'yotsukaido',
  '大網白里市':   'oamishirasato',
  '富里市':       'tomisato',
  '山武市':       'sanmu',
  '山武郡':       'sanmu',
  '成田市':       'narita',
  '我孫子市':     'abiko',
  '旭市':         'asahi',
  '東金市':       'togane',
  '松戸市':       'matsudo',
  '柏市':         'kashiwa',
  '流山市':       'nagareyama',
  '船橋市':       'funabashi',
  '茂原市':       'mobara',
  '銚子市':       'choshi',
  '長生郡':       'chosei',
  '香取郡':       'katori',
  '香取市':       'katori',
  // 茨城県
  'つくばみらい市': 'tsukubamirai',
  'つくば市':     'tsukuba',
  'ひたちなか市': 'hitachinaka',
  '取手市':       'toride',
  '土浦市':       'tsuchiura',
  '守谷市':       'moriya',
  '常総市':       'joso',
  '日立市':       'hitachi',
  '東茨城郡':     'higashiibaraki',
  '水戸市':       'mito',
  '潮来市':       'itako',
  '牛久市':       'ushiku',
  '神栖市':       'kamisu',
  '稲敷市':       'inashiki',
  '稲敷郡':       'inashiki',
  '行方市':       'namegata',
  '那珂市':       'naka',
  '鉾田市':       'hokota',
  '阿見町':       'ami',
  '鹿嶋市':       'kashima',
  '龍ケ崎市':     'ryugasaki',
};

// WP メーカー選択フィールドの許容値（Kintone入力と照合して正規化）
const MAKER_LIST = [
  'LIXIL',
  'TOTO',
  'パナソニック',
  'クリナップ',
  'タカラスタンダード',
  'TOCLAS',
  'FIRST PLUS',
  'WOODONE',
  'エイダイ',
  'ノーリツ',
  'ハウジング重兵衛社内仕入',
];

// WP tenpo フィールドの選択肢（WP ACF select の選択値と完全一致させること）
// Kintone 店舗選択値と部分一致で照合し、ここに定義した文字列をそのままWPに送る
const TENPO_LIST = [
  '本社（成田ショールーム）',
  '千葉若葉ショールーム店',
  '旭・東金店',
  'パルナ稲敷・佐原ショールーム店',
  '鹿嶋・神栖店',
  '牛久・龍ヶ崎・阿見店',
  '佐倉ショールーム店',
  '柏ショールーム店',
  '東金ショールーム店',
  '茨城本店・水戸ショールーム',
  '取手・守谷ショールーム店',
];

module.exports = { CONFIG, CATEGORY_MAP, AREA_MAP, MAKER_LIST, TENPO_LIST };
