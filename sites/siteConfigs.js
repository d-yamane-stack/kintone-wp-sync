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
      shohin: 'shohin',
      menseki: 'menseki',
      tanto_message: 'tanto_message',
      tanto_free: 'tanto_free',
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
    },
  },

  // ---- サイト2: サンプル別サイト（フィールド名・タクソノミーが異なる例） ----
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
