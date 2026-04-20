'use strict';

// 共有定数（サイト設定のデフォルト値として利用）
const { CATEGORY_MAP, AREA_MAP, MAKER_LIST, TENPO_LIST } = require('../config');

/**
 * 複数サイト設定マップ
 *
 * 各サイトで異なる項目:
 *   - wordpress: 接続先・認証情報・投稿タイプ
 *   - taxonomyMapping: WP側のタクソノミースラッグ名・変換マップ
 *   - acfMapping: ACFフィールドキー名
 *   - makerList / tenpoList: プルダウン照合リスト
 *   - promptKey: ai/prompts/{key}.js を使用
 *   - defaultStatus: 'draft' | 'publish'
 */
const SITE_CONFIGS = {

  // ---- サイト1: ハウジング重兵衛（既存サイト） ----
  jube: {
    siteId: 'jube',
    siteName: 'ハウジング重兵衛',
    wordpress: {
      baseUrl:      process.env.JUBE_WP_BASE_URL       || process.env.WP_BASE_URL,
      adminBaseUrl: process.env.JUBE_WP_ADMIN_BASE_URL || process.env.WP_ADMIN_BASE_URL,
      username:     process.env.JUBE_WP_USERNAME       || process.env.WP_USERNAME,
      appPassword:  process.env.JUBE_WP_APP_PASSWORD   || process.env.WP_APP_PASSWORD,
      postType: 'example',
    },
    taxonomyMapping: {
      category: 'example_category',
      area: 'example_area',
      showroom: 'example_showroom', // nullにすると照合スキップ
      categoryMap: CATEGORY_MAP,
      areaMap: AREA_MAP,
    },
    acfMapping: {
      // data field → ACF key
      nayami: 'nayami',
      point: 'point',
      koe: 'koe',
      hiyou: 'hiyou',
      kikan: 'kikan',
      area: 'area',
      shubetu: 'shubetu',
      tiku: 'tiku',
      maker: 'maker',
      shohin: 'shouhin',
      menseki: 'menseki',
      tanto_message: 'tantou',   // 担当者の一言（テキストエリア）
      tanto_free: 'user2',       // 担当者(リストにいない場合)（テキスト）
      tanto: 'user',             // 担当者（ユーザー型 → WPユーザーID）
      tenpo: 'tenpo',
      // Repeaterフィールド名
      afterRepeater: 'after-main',
      afterRepeaterField: 'after-img',
      beforeRepeater: 'before-main',
      beforeRepeaterField: 'before-img',
    },
    makerList: MAKER_LIST,
    tenpoList: TENPO_LIST,
    promptKey: 'reform',
    defaultStatus: 'draft',
    // --- コラム生成設定 ---
    columnPromptKey: 'column_jube',
    columnConfig: {
      postType: 'column',      // WPの投稿タイプ（コラム専用カスタム投稿タイプ）
      defaultStatus: 'draft',
      categoryIds: [],
      // コラム画像フォルダ（タイトルと照合してスピーチバルーン下に自動挿入）
      columnImageFolder: 'C:\\Users\\yamane daichi\\Desktop\\コラム_画像',
      // タグタクソノミー（wp-json/wp/v2/types/column の taxonomies で確認）
      tagTaxonomy: 'column_tag',
    },
    // --- AIキーワードリコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの地域密着リフォーム・リノベーション会社',
      focusAreas: 'キッチン/浴室/トイレ/内装/窓/断熱/フローリング/リノベーション/水回り/間取り変更など住宅リフォーム全般',
      excludeAreas: '外壁塗装・屋根塗装（これらは別サイト担当のため除外すること）',
    },
  },

  // ---- サイト2: 塗装屋ぬりべえ（外壁塗装・屋根塗装専門） ----
  nurube: {
    siteId: 'nurube',
    siteName: '塗装屋ぬりべえ',
    wordpress: {
      baseUrl:      process.env.NURUBE_WP_BASE_URL      || '',
      adminBaseUrl: process.env.NURUBE_WP_ADMIN_BASE_URL || 'https://nuribe.jp/refresh2023',
      username:     process.env.NURUBE_WP_USERNAME      || '',
      appPassword:  process.env.NURUBE_WP_APP_PASSWORD  || '',
      postType: 'properties',  // 施工事例の投稿タイプ
    },
    taxonomyMapping: {
      category: null,
      area: null,
      showroom: null,
      categoryMap: {},
      areaMap: {},
    },
    acfMapping: {
      // ぬりべえ WP properties 投稿 ACFフィールド
      nayami:        'nayami',        // お客様のご要望
      point:         'point',         // ご提案内容
      koe:           'koe',           // お客様の声
      hiyou:         'hiyou',         // 価格帯
      kikan:         'kikan',         // 工事期間
      menseki:       'menseki',       // 施工面積
      maker:         'maker',         // メーカー（先頭）
      tiku:          'tiku',          // 築年数
      tenpo:         'tenpo',         // 店舗（空欄）
      tanto_message: 'tantou',        // 担当者から一言
      tanto:         'user',          // 担当者ユーザーID (ACF User型)
      // 施工後写真 repeater
      afterRepeater:      'after-main',
      afterRepeaterField: 'after-img',
      // 施工中写真 repeater
      duringRepeater:      'under-main',
      duringRepeaterField: 'under-img',
      // 施工前写真 repeater
      beforeRepeater:      'before-main',
      beforeRepeaterField: 'before-img',
      // 集合写真 (単一画像)
      syugou: 'syuugou',
      // 材料リスト repeater
      buzaiRepeater: 'buzai-wrap',
      makerField:    'mekar2',
      productField:  'name2',
    },
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    // --- コラム生成設定 ---
    columnPromptKey: 'column_nurube',
    columnConfig: {
      postType: 'column',      // WPの投稿タイプ（コラム専用カスタム投稿タイプ）
      defaultStatus: 'draft',
      categoryIds: [],
      // タグタクソノミー（wp-json/wp/v2/types/column の taxonomies で確認）
      tagTaxonomy: 'column_tag',
      // 画像はアイキャッチのみ（本文には挿入しない）
      featuredImageOnly: true,
      // H2見出しスタイルクラス（セクション）
      headingClass: 'is-style-heading-type-1',
      // まとめH2はクラスなし
      summaryHeadingClass: '',
      // スピーチバルーン形式
      speechBalloonStyle: 'shortcode',
      // 本文末尾のCTAセクションを出力しない
      disableCta: true,
    },
    // --- AIキーワードリコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの外壁塗装・屋根塗装専門会社',
      focusAreas: '外壁塗装/屋根塗装/防水工事/コーキング/塗料選び/費用相場/助成金/色選び/業者選びのポイントなど塗装専門テーマ',
      excludeAreas: 'キッチン・浴室・トイレなど内装リフォーム全般（塗装専門サイトのため除外すること）',
    },
  },

  // ---- サイト3: サンプル別サイト（フィールド名・タクソノミーが異なる例） ----
  another_site: {
    siteId: 'another_site',
    siteName: 'サンプル別サイト',
    wordpress: {
      baseUrl: process.env.ANOTHER_WP_BASE_URL,
      username: process.env.ANOTHER_WP_USERNAME,
      appPassword: process.env.ANOTHER_WP_APP_PASSWORD,
      postType: 'jirei', // 別の投稿タイプ
    },
    taxonomyMapping: {
      category: 'jirei_category',
      area: 'jirei_area',
      showroom: null, // ショールームタクソノミーなし
      categoryMap: CATEGORY_MAP, // 同じマッピングを流用
      areaMap: AREA_MAP,
    },
    acfMapping: {
      // フィールドキーが異なるサイトの例
      nayami: 'trouble_text',
      point: 'reform_point',
      koe: 'customer_voice',
      hiyou: 'cost',
      kikan: 'period',
      area: 'location_city',
      shubetu: 'property_type',
      tiku: 'building_age',
      maker: 'maker_name',
      shohin: 'product_name',
      menseki: 'area_size',
      tanto_message: 'staff_message',
      tanto_free: 'staff_name',
      tenpo: 'shop_name',
      afterRepeater: 'after_images',
      afterRepeaterField: 'image_id',
      beforeRepeater: 'before_images',
      beforeRepeaterField: 'image_id',
    },
    makerList: MAKER_LIST, // 共有リストを流用
    tenpoList: [], // tenpoなし
    promptKey: 'reform', // 同じプロンプトを流用
    defaultStatus: 'draft',
    columnPromptKey: 'column_jube', // 別途作成する場合は 'column_another' に変更
    columnConfig: {
      postType: 'post',
      defaultStatus: 'draft',
      categoryIds: [],
    },
    // --- AIキーワードリコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの地域密着リフォーム会社',
      focusAreas: 'リフォーム全般',
      excludeAreas: 'なし',
    },
  },

};

/**
 * siteId からサイト設定を取得する。
 * wordpress.restBase を動的に補完して返す。
 * @param {string} siteId
 * @returns {object} siteConfig
 */
function getSiteConfig(siteId) {
  const base = SITE_CONFIGS[siteId];
  if (!base) {
    throw new Error(
      '不明なサイトID: "' + siteId + '"（利用可能: ' + Object.keys(SITE_CONFIGS).join(', ') + '）'
    );
  }

  const wp = base.wordpress;
  if (!wp.baseUrl || !wp.username || !wp.appPassword) {
    throw new Error(
      'サイト "' + siteId + '" のWordPress認証情報が未設定です（baseUrl / username / appPassword）'
    );
  }

  const cleanBase  = wp.baseUrl.replace(/\/$/, '');
  const adminBase  = (wp.adminBaseUrl || cleanBase).replace(/\/$/, '');

  return Object.assign({}, base, {
    wordpress: Object.assign({}, wp, {
      restBase:  cleanBase + '/wp-json/wp/v2/',
      adminBase: adminBase + '/wp-admin/',
    }),
  });
}

module.exports = { SITE_CONFIGS, getSiteConfig };
