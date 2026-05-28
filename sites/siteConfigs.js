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
    siteName: 'ハウジング重兵衛',
    wordpress: {
      baseUrl:      process.env.JUBE_WP_BASE_URL       || process.env.WP_BASE_URL,
      adminBaseUrl: process.env.JUBE_WP_ADMIN_BASE_URL || process.env.WP_ADMIN_BASE_URL,
      username:     process.env.JUBE_WP_USERNAME       || process.env.WP_USERNAME,
      appPassword:  process.env.JUBE_WP_APP_PASSWORD   || process.env.WP_APP_PASSWORD,
      postType: 'example',
      syncKey:  process.env.WP_SYNC_KEY || '', // admin-ajax.php 経由同期用シークレットキー
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
      // 図面: Repeaterフィールド (サブフィールド: zumen-img)
      zumen:       'zumen',
      zumenField:  'zumen-img',   // zumen Repeaterのサブフィールドキー → [{zumen-img: id}] 形式
      // 集合写真・直筆コメント: 単一Imageフィールド（整数のメディアIDを送信）
      syugou:      'syuugou',
      syugouField: null,           // null = 単一整数で送信
      koment:      'koment',
      komentField: null,           // null = 単一整数で送信
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
    siteName: '塗装屋ぬりべえ',
    wordpress: {
      baseUrl:      process.env.NURUBE_WP_BASE_URL      || '',
      adminBaseUrl: process.env.NURUBE_WP_ADMIN_BASE_URL || 'https://nuribe.jp/refresh2023',
      username:     process.env.NURUBE_WP_USERNAME      || '',
      appPassword:  process.env.NURUBE_WP_APP_PASSWORD  || '',
      postType: 'properties',  // 譁ｽ蟾･莠倶ｾ九・謚慕ｨｿ繧ｿ繧､繝・
      syncKey:  process.env.WP_SYNC_KEY || '', // admin-ajax.php 経由同期用シークレットキー
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
      focusAreas: '外壁塗装/屋根塗装/防水工事/コーキング補修/塗料選び/色選び/塗装工程/塗り替え時期/ひび割れ/サビ/助成金/補助金など塗装工事全般',
      consultant: '外壁塗装・屋根塗装専門店のSEO・AIOコンサルタント',
      excludeAreas: 'キッチン・お風呂・トイレ・内装・フローリングなど塗装と無関係の内装リフォーム',
    },
  },

  // ---- サイト: funs life home（新築注文住宅・非WP / 貼付コード出力）----
  'funs-life-home': {
    siteId: 'funs-life-home',
    siteName: 'funs life home',
    // 非WPサイト: WP接続情報なし。コラムはWP投稿せず貼付用コードを生成して画面表示する
    wordpress: {
      baseUrl: '',
      username: '',
      appPassword: '',
      postType: 'post',
      noWordpress: true,
    },
    taxonomyMapping: { category: null, area: null, showroom: null, categoryMap: {}, areaMap: {} },
    acfMapping: {},
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    // --- コラム生成設定 ---
    columnPromptKey: 'column_funs_life_home',
    columnConfig: {
      // outputMode='paste': WP投稿をスキップし、貼付用HTML＋画像＋SEOを生成してDBに保存（画面でコピー/DL）
      outputMode: 'paste',
      htmlStyle: 'funs-life-home', // funs独自CMS形式（.h1/.spc/目次/<%image1s%>トークン）+ 記事画像3枚
      defaultStatus: 'generated',
      disableCta: false,
    },
    // --- AIキーワードレコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの新築注文住宅ブランド funs life home',
      focusAreas: '新築注文住宅/家づくり/間取り/住宅性能/断熱・気密/資金計画/住宅ローン/土地探し/デザイン住宅など新築注文住宅全般',
      consultant: '新築注文住宅専門のSEO・AIOコンサルタント',
      excludeAreas: 'リフォーム・塗装・解体・中古住宅など新築注文住宅以外のテーマ',
    },
  },

  // ---- サイト: 中古リノベ（土地・中古住宅専門店 ハウジング重兵衛）----
  estate: {
    siteId: 'estate',
    siteName: '中古リノベ',
    wordpress: {
      baseUrl:      process.env.ESTATE_WP_BASE_URL       || 'https://www.jube-estate.com/wp',
      adminBaseUrl: process.env.ESTATE_WP_ADMIN_BASE_URL || 'https://www.jube-estate.com/wp',
      username:     process.env.ESTATE_WP_USERNAME       || 'jube',
      appPassword:  process.env.ESTATE_WP_APP_PASSWORD   || '',
      postType: 'post',
      // パーマリンク非整形のため ?rest_route= 形式のREST APIを使う（→ getSiteConfigでrestBase組立）
      restRouteStyle: true,
      syncKey:  process.env.WP_SYNC_KEY || '',
    },
    taxonomyMapping: { category: null, area: null, showroom: null, categoryMap: {}, areaMap: {} },
    acfMapping: {},
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    columnPromptKey: 'column_estate',
    columnConfig: {
      postType: 'post',
      defaultStatus: 'draft',
      categoryIds: [],
      tagTaxonomy: 'tags',
    },
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの土地・中古住宅・中古マンションのリノベーション専門店',
      focusAreas: '中古住宅購入/中古マンション/リノベーション費用/住宅ローン/補助金/物件選び/間取り変更/水回りリノベ/断熱リフォームなど中古×リノベ全般',
      consultant: '中古住宅・リノベーション専門のSEO・AIOコンサルタント',
      excludeAreas: '新築注文住宅・塗装専門・解体専門など中古リノベ以外のテーマ',
    },
  },

  // ---- サイト: 解体（じゅうべえの解体・家屋解体/住宅解体専門）----
  kaitai: {
    siteId: 'kaitai',
    siteName: '解体',
    wordpress: {
      baseUrl:      process.env.KAITAI_WP_BASE_URL       || 'https://jube-kaitai.com',
      adminBaseUrl: process.env.KAITAI_WP_ADMIN_BASE_URL || 'https://jube-kaitai.com/cms',
      username:     process.env.KAITAI_WP_USERNAME       || 'webadmin1',
      appPassword:  process.env.KAITAI_WP_APP_PASSWORD   || '',
      postType: 'post',
      syncKey:  process.env.WP_SYNC_KEY || '',
    },
    taxonomyMapping: { category: null, area: null, showroom: null, categoryMap: {}, areaMap: {} },
    acfMapping: {},
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    columnPromptKey: 'column_kaitai',
    columnConfig: {
      postType: 'post',
      defaultStatus: 'draft',
      categoryIds: [],
      tagTaxonomy: 'tags',
    },
    recommendConfig: {
      siteDescription: '千葉県・茨城県のローコスト解体工事専門店「じゅうべえの解体」',
      focusAreas: '家屋解体/住宅解体/解体費用相場/解体の流れ/補助金・助成金/アスベスト/廃棄物処理/近隣対策/見積もり/空き家解体など解体工事全般',
      consultant: '解体工事専門のSEO・AIOコンサルタント',
      excludeAreas: '新築・リフォーム・塗装・中古など解体工事以外のテーマ',
    },
  },

  // ---- サイト: ガレージ倉庫（ガレージ&農業倉庫）----
  warehousegarage: {
    siteId: 'warehousegarage',
    siteName: 'ガレージ倉庫',
    wordpress: {
      baseUrl:      process.env.WHG_WP_BASE_URL       || 'https://warehousegarage.com',
      adminBaseUrl: process.env.WHG_WP_ADMIN_BASE_URL || 'https://warehousegarage.com/wp',
      username:     process.env.WHG_WP_USERNAME       || 'whg-manager',
      appPassword:  process.env.WHG_WP_APP_PASSWORD   || '',
      postType: 'post',
      syncKey:  process.env.WP_SYNC_KEY || '',
    },
    taxonomyMapping: { category: null, area: null, showroom: null, categoryMap: {}, areaMap: {} },
    acfMapping: {},
    makerList: [],
    tenpoList: [],
    promptKey: 'reform',
    defaultStatus: 'draft',
    columnPromptKey: 'column_warehousegarage',
    columnConfig: {
      postType: 'post',
      defaultStatus: 'draft',
      categoryIds: [],
      tagTaxonomy: 'tags',
    },
    recommendConfig: {
      siteDescription: '千葉・茨城エリアのガレージ・農業倉庫の建築/施工専門店',
      focusAreas: 'ガレージ建築/農業倉庫/車庫/物置/鉄骨造/テント倉庫/建築費用相場/固定資産税/確認申請/用途別の選び方など倉庫・ガレージ全般',
      consultant: 'ガレージ・倉庫建築専門のSEO・AIOコンサルタント',
      excludeAreas: '新築住宅・リフォーム・塗装・解体など倉庫/ガレージ以外のテーマ',
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

  const wp = base.wordpress || {};

  // 非WPサイト（貼付コード出力モード等）はWP接続情報の検証をスキップ
  const isNoWp = !!(wp.noWordpress) ||
    !!(base.columnConfig && base.columnConfig.outputMode === 'paste');

  if (!isNoWp) {
    if (!wp.baseUrl || !wp.username || !wp.appPassword) {
      throw new Error(
        'WordPress config is incomplete for site "' + siteId + '": baseUrl / username / appPassword'
      );
    }
  }

  const cleanBase  = (wp.baseUrl || '').replace(/\/$/, '');
  const adminBase  = (wp.adminBaseUrl || cleanBase).replace(/\/$/, '');

  // restBase の組み立て:
  //   1. wp.restBase が明示指定されていればそれを使う
  //   2. wp.restRouteStyle=true（パーマリンク非整形のWP）→ ?rest_route= 形式
  //   3. それ以外は標準の /wp-json/wp/v2/ 形式
  let restBase;
  if (wp.restBase) {
    restBase = wp.restBase;
  } else if (wp.restRouteStyle) {
    restBase = cleanBase + '/?rest_route=/wp/v2/';
  } else {
    restBase = cleanBase + '/wp-json/wp/v2/';
  }

  return Object.assign({}, base, {
    wordpress: Object.assign({}, wp, {
      restBase:  restBase,
      adminBase: adminBase + '/wp-admin/',
    }),
  });
}

module.exports = { SITE_CONFIGS, getSiteConfig };


