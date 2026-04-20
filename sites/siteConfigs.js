'use strict';

// 蜈ｱ譛牙ｮ壽焚・医し繧､繝郁ｨｭ螳壹・繝・ヵ繧ｩ繝ｫ繝亥､縺ｨ縺励※蛻ｩ逕ｨ・・
const { CATEGORY_MAP, AREA_MAP, MAKER_LIST, TENPO_LIST } = require('../config');

/**
 * 隍・焚繧ｵ繧､繝郁ｨｭ螳壹・繝・・
 *
 * 蜷・し繧､繝医〒逡ｰ縺ｪ繧矩・岼:
 *   - wordpress: 謗･邯壼・繝ｻ隱崎ｨｼ諠・ｱ繝ｻ謚慕ｨｿ繧ｿ繧､繝・
 *   - taxonomyMapping: WP蛛ｴ縺ｮ繧ｿ繧ｯ繧ｽ繝弱Α繝ｼ繧ｹ繝ｩ繝・げ蜷阪・螟画鋤繝槭ャ繝・
 *   - acfMapping: ACF繝輔ぅ繝ｼ繝ｫ繝峨く繝ｼ蜷・
 *   - makerList / tenpoList: 繝励Ν繝繧ｦ繝ｳ辣ｧ蜷医Μ繧ｹ繝・
 *   - promptKey: ai/prompts/{key}.js 繧剃ｽｿ逕ｨ
 *   - defaultStatus: 'draft' | 'publish'
 */
const SITE_CONFIGS = {

  // ---- 繧ｵ繧､繝・: 繝上え繧ｸ繝ｳ繧ｰ驥榊・陦幢ｼ域里蟄倥し繧､繝茨ｼ・----
  jube: {
    siteId: 'jube',
    siteName: 'jube',
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
      showroom: 'example_showroom', // null縺ｫ縺吶ｋ縺ｨ辣ｧ蜷医せ繧ｭ繝・・
      categoryMap: CATEGORY_MAP,
      areaMap: AREA_MAP,
    },
    acfMapping: {
      // data field 竊・ACF key
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
      tanto_message: 'tantou',   // 諡・ｽ楢・・荳險・医ユ繧ｭ繧ｹ繝医お繝ｪ繧｢・・
      tanto_free: 'user2',       // 諡・ｽ楢・繝ｪ繧ｹ繝医↓縺・↑縺・ｴ蜷・・医ユ繧ｭ繧ｹ繝茨ｼ・
      tanto: 'user',             // 諡・ｽ楢・ｼ医Θ繝ｼ繧ｶ繝ｼ蝙・竊・WP繝ｦ繝ｼ繧ｶ繝ｼID・・
      tenpo: 'tenpo',
      // Repeater繝輔ぅ繝ｼ繝ｫ繝牙錐
      afterRepeater: 'after-main',
      afterRepeaterField: 'after-img',
      beforeRepeater: 'before-main',
      beforeRepeaterField: 'before-img',
    },
    makerList: MAKER_LIST,
    tenpoList: TENPO_LIST,
    promptKey: 'reform',
    defaultStatus: 'draft',
    // --- 繧ｳ繝ｩ繝逕滓・險ｭ螳・---
    columnPromptKey: 'column_jube',
    columnConfig: {
      postType: 'column',      // WP縺ｮ謚慕ｨｿ繧ｿ繧､繝暦ｼ医さ繝ｩ繝蟆ら畑繧ｫ繧ｹ繧ｿ繝謚慕ｨｿ繧ｿ繧､繝暦ｼ・
      defaultStatus: 'draft',
      categoryIds: [],
      // 繧ｳ繝ｩ繝逕ｻ蜒上ヵ繧ｩ繝ｫ繝・医ち繧､繝医Ν縺ｨ辣ｧ蜷医＠縺ｦ繧ｹ繝斐・繝√ヰ繝ｫ繝ｼ繝ｳ荳九↓閾ｪ蜍墓諺蜈･・・
      columnImageFolder: process.env.COLUMN_IMAGE_FOLDER || '',
      // 繧ｿ繧ｰ繧ｿ繧ｯ繧ｽ繝弱Α繝ｼ・・p-json/wp/v2/types/column 縺ｮ taxonomies 縺ｧ遒ｺ隱搾ｼ・
      tagTaxonomy: 'column_tag',
    },
    // --- AI繧ｭ繝ｼ繝ｯ繝ｼ繝峨Μ繧ｳ繝｡繝ｳ繝芽ｨｭ螳・---
    recommendConfig: {
      siteDescription: '蜊・痩繝ｻ闌ｨ蝓弱お繝ｪ繧｢縺ｮ蝨ｰ蝓溷ｯ・捩繝ｪ繝輔か繝ｼ繝繝ｻ繝ｪ繝弱・繝ｼ繧ｷ繝ｧ繝ｳ莨夂､ｾ',
      focusAreas: '繧ｭ繝・メ繝ｳ/豬ｴ螳､/繝医う繝ｬ/蜀・｣・遯・譁ｭ辭ｱ/繝輔Ο繝ｼ繝ｪ繝ｳ繧ｰ/繝ｪ繝弱・繝ｼ繧ｷ繝ｧ繝ｳ/豌ｴ蝗槭ｊ/髢灘叙繧雁､画峩縺ｪ縺ｩ菴丞ｮ・Μ繝輔か繝ｼ繝蜈ｨ闊ｬ',
      excludeAreas: 'none',
    },
  },

  // ---- 繧ｵ繧､繝・: 蝪苓｣・ｱ九〓繧翫∋縺茨ｼ亥､門｣∝｡苓｣・・螻区ｹ蝪苓｣・ｰる摩・・----
  nurube: {
    siteId: 'nurube',
    siteName: 'nurube',
    wordpress: {
      baseUrl:      process.env.NURUBE_WP_BASE_URL      || '',
      adminBaseUrl: process.env.NURUBE_WP_ADMIN_BASE_URL || 'https://nuribe.jp/refresh2023',
      username:     process.env.NURUBE_WP_USERNAME      || '',
      appPassword:  process.env.NURUBE_WP_APP_PASSWORD  || '',
      postType: 'properties',  // 譁ｽ蟾･莠倶ｾ九・謚慕ｨｿ繧ｿ繧､繝・
    },
    taxonomyMapping: {
      category: null,
      area: null,
      showroom: null,
      categoryMap: {},
      areaMap: {},
    },
    acfMapping: {
      // 縺ｬ繧翫∋縺・WP properties 謚慕ｨｿ ACF繝輔ぅ繝ｼ繝ｫ繝・
      nayami:        'nayami',        // 縺雁ｮ｢讒倥・縺碑ｦ∵悍
      point:         'point',         // 縺疲署譯亥・螳ｹ
      koe:           'koe',           // 縺雁ｮ｢讒倥・螢ｰ
      hiyou:         'hiyou',         // 萓｡譬ｼ蟶ｯ
      kikan:         'kikan',         // 蟾･莠区悄髢・
      menseki:       'menseki',       // 譁ｽ蟾･髱｢遨・
      maker:         'maker',         // 繝｡繝ｼ繧ｫ繝ｼ・亥・鬆ｭ・・
      tiku:          'tiku',          // 遽牙ｹｴ謨ｰ
      tenpo:         'tenpo',         // 蠎苓・・育ｩｺ谺・ｼ・
      tanto_message: 'tantou',        // 諡・ｽ楢・°繧我ｸ險
      tanto:         'user',          // 諡・ｽ楢・Θ繝ｼ繧ｶ繝ｼID (ACF User蝙・
      // 譁ｽ蟾･蠕悟・逵・repeater
      afterRepeater:      'after-main',
      afterRepeaterField: 'after-img',
      // 譁ｽ蟾･荳ｭ蜀咏悄 repeater
      duringRepeater:      'under-main',
      duringRepeaterField: 'under-img',
      // 譁ｽ蟾･蜑榊・逵・repeater
      beforeRepeater:      'before-main',
      beforeRepeaterField: 'before-img',
      // 髮・粋蜀咏悄 (蜊倅ｸ逕ｻ蜒・
      syugou: 'syuugou',
      // 譚先侭繝ｪ繧ｹ繝・repeater
      buzaiRepeater: 'buzai-wrap',
      makerField:    'mekar2',
      productField:  'name2',
    },
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    // --- 繧ｳ繝ｩ繝逕滓・險ｭ螳・---
    columnPromptKey: 'column_nurube',
    columnConfig: {
      postType: 'column',      // WP縺ｮ謚慕ｨｿ繧ｿ繧､繝暦ｼ医さ繝ｩ繝蟆ら畑繧ｫ繧ｹ繧ｿ繝謚慕ｨｿ繧ｿ繧､繝暦ｼ・
      defaultStatus: 'draft',
      categoryIds: [],
      // 繧ｿ繧ｰ繧ｿ繧ｯ繧ｽ繝弱Α繝ｼ・・p-json/wp/v2/types/column 縺ｮ taxonomies 縺ｧ遒ｺ隱搾ｼ・
      tagTaxonomy: 'column_tag',
      // 逕ｻ蜒上・繧｢繧､繧ｭ繝｣繝・メ縺ｮ縺ｿ・域悽譁・↓縺ｯ謖ｿ蜈･縺励↑縺・ｼ・
      featuredImageOnly: true,
      // H2隕句・縺励せ繧ｿ繧､繝ｫ繧ｯ繝ｩ繧ｹ・医そ繧ｯ繧ｷ繝ｧ繝ｳ・・
      headingClass: 'is-style-heading-type-1',
      // 縺ｾ縺ｨ繧？2縺ｯ繧ｯ繝ｩ繧ｹ縺ｪ縺・
      summaryHeadingClass: '',
      // 繧ｹ繝斐・繝√ヰ繝ｫ繝ｼ繝ｳ蠖｢蠑・
      speechBalloonStyle: 'shortcode',
      // 譛ｬ譁・忰蟆ｾ縺ｮCTA繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ繧貞・蜉帙＠縺ｪ縺・
      disableCta: true,
    },
    // --- AI繧ｭ繝ｼ繝ｯ繝ｼ繝峨Μ繧ｳ繝｡繝ｳ繝芽ｨｭ螳・---
    recommendConfig: {
      siteDescription: '蜊・痩繝ｻ闌ｨ蝓弱お繝ｪ繧｢縺ｮ螟門｣∝｡苓｣・・螻区ｹ蝪苓｣・ｰる摩莨夂､ｾ',
      focusAreas: 'nurube_column',
      excludeAreas: 'none',
    },
  },

  // ---- 繧ｵ繧､繝・: 繧ｵ繝ｳ繝励Ν蛻･繧ｵ繧､繝茨ｼ医ヵ繧｣繝ｼ繝ｫ繝牙錐繝ｻ繧ｿ繧ｯ繧ｽ繝弱Α繝ｼ縺檎焚縺ｪ繧倶ｾ具ｼ・----
  another_site: {
    siteId: 'another_site',
    siteName: 'another_site',
    wordpress: {
      baseUrl: process.env.ANOTHER_WP_BASE_URL,
      username: process.env.ANOTHER_WP_USERNAME,
      appPassword: process.env.ANOTHER_WP_APP_PASSWORD,
      postType: 'jirei', // 蛻･縺ｮ謚慕ｨｿ繧ｿ繧､繝・
    },
    taxonomyMapping: {
      category: 'jirei_category',
      area: 'jirei_area',
      showroom: null, // 繧ｷ繝ｧ繝ｼ繝ｫ繝ｼ繝繧ｿ繧ｯ繧ｽ繝弱Α繝ｼ縺ｪ縺・
      categoryMap: CATEGORY_MAP, // 蜷後§繝槭ャ繝斐Φ繧ｰ繧呈ｵ∫畑
      areaMap: AREA_MAP,
    },
    acfMapping: {
      // 繝輔ぅ繝ｼ繝ｫ繝峨く繝ｼ縺檎焚縺ｪ繧九し繧､繝医・萓・
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
    makerList: MAKER_LIST, // 蜈ｱ譛峨Μ繧ｹ繝医ｒ豬∫畑
    tenpoList: [], // tenpo縺ｪ縺・
    promptKey: 'reform', // 蜷後§繝励Ο繝ｳ繝励ヨ繧呈ｵ∫畑
    defaultStatus: 'draft',
    columnPromptKey: 'column_jube', // 蛻･騾比ｽ懈・縺吶ｋ蝣ｴ蜷医・ 'column_another' 縺ｫ螟画峩
    columnConfig: {
      postType: 'post',
      defaultStatus: 'draft',
      categoryIds: [],
    },
    // --- AI繧ｭ繝ｼ繝ｯ繝ｼ繝峨Μ繧ｳ繝｡繝ｳ繝芽ｨｭ螳・---
    recommendConfig: {
      siteDescription: '蜊・痩繝ｻ闌ｨ蝓弱お繝ｪ繧｢縺ｮ蝨ｰ蝓溷ｯ・捩繝ｪ繝輔か繝ｼ繝莨夂､ｾ',
      focusAreas: '繝ｪ繝輔か繝ｼ繝蜈ｨ闊ｬ',
      excludeAreas: 'none',
    },
  },

};

/**
 * siteId 縺九ｉ繧ｵ繧､繝郁ｨｭ螳壹ｒ蜿門ｾ励☆繧九・
 * wordpress.restBase 繧貞虚逧・↓陬懷ｮ後＠縺ｦ霑斐☆縲・
 * @param {string} siteId
 * @returns {object} siteConfig
 */
function getSiteConfig(siteId) {
  const base = SITE_CONFIGS[siteId];
  if (!base) {
    throw new Error(
      'Unknown siteId: "' + siteId + '". Available: ' + Object.keys(SITE_CONFIGS).join(', ')
    );
  }

  const wp = base.wordpress;
  if (!wp.baseUrl || !wp.username || !wp.appPassword) {
    throw new Error(
      'WordPress config is incomplete for site "' + siteId + '": baseUrl / username / appPassword'
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


