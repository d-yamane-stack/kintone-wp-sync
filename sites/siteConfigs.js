'use strict';

// 共有定数（サイト設定のデフォルト値として利用）
const { CATEGORY_MAP, AREA_MAP, MAKER_LIST, TENPO_LIST } = require('../config');

/**
 * 複数サイト設定マップ
 *
 * 各サイトで異なる項目:
 *   - wordpress: 接続先・認証情報・投稿タイプ
 *   - taxonomyMapping: WP側のタクソノミースラッグ名の変換マップ
 *   - acfMapping: ACFフィールドキー名
 *   - makerList / tenpoList: プルダウン照合リスト
 *   - promptKey: ai/prompts/{key}.js を使用
 *   - defaultStatus: 'draft' | 'publish'
 */
const SITE_CONFIGS = {

  // ---- サイト1: ハウジング重兵衛（既存サイト）----
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
      tanto_free: 'user2',       // 担当者リストにいない場合（テキスト）
      tanto: 'user',             // 担当者（ユーザー型 → WPユーザーID）
      tenpo: 'tenpo',
      // Repeaterフィールド名
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
    // --- コラム生成設定 ---
    columnPromptKey: 'column_jube',
    columnConfig: {
      postType: 'column',      // WPの投稿タイプ（コラム専用カスタム投稿タイプ）
      defaultStatus: 'draft',
      categoryIds: [],
      // コラム画像フォルダ（タイトルと照合してスピーチバルーン下に自動挿入）
      columnImageFolder: process.env.COLUMN_IMAGE_FOLDER || '',
      // タグタクソノミー（/wp-json/wp/v2/types/column の taxonomies で確認）
      tagTaxonomy: 'column_tag',
    },
    // --- AIキーワードレコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの地域密着リフォーム・リノベーション会社',
      focusAreas: 'キッチン/浴室/トイレ/内装/窓/断熱/フローリング/リノベーション/水回り/間取り変更など住宅リフォーム全般',
      excludeAreas: 'none',
    },
  },

  // ---- サイト2: 塗装屋ぬりべえ（外壁塗装・屋根塗装専門）----
  nurube: {
    siteId: 'nurube',
    siteName: '塗装屋ぬりべえ',
    wordpress: {
      baseUrl:      process.env.NURUBE_WP_BASE_URL      || '',
      adminBaseUrl: process.env.NURUBE_WP_ADMIN_BASE_URL || 'https://nuribe.jp/refresh2023',
      username:     process.env.NURUBE_WP_USERNAME      || '',
      appPassword:  process.env.NURUBE_WP_APP_PASSWORD  || '',
      postType: 'properties',  // 施工事例の投稿タイプ
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
      // ぬりべえ WP properties 投稿 ACFフィールド
      nayami:        'nayami',        // お客様のご要望
      point:         'point',         // ご提案内容
      koe:           'koe',           // お客様の声
      hiyou:         'hiyou',         // 価格帯
      kikan:         'kikan',         // 工事期間
      menseki:       'menseki',       // 施工面積
      maker:         'maker',         // メーカー（塗料）
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
      // タグタクソノミー（/wp-json/wp/v2/types/column の taxonomies で確認）
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
    // --- AIキーワードレコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの外壁塗装・屋根塗装専門会社',
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
      // スタッフコラム専用CPT（投稿タイプslug=column / rest_base=columns）。
      // RESTは rest_base を使うため postType には複数形 'columns' を指定する
      //   → restBase + 'columns' = https://www.jube-estate.com/wp/?rest_route=/wp/v2/columns
      postType: 'columns',
      defaultStatus: 'draft',
      categoryIds: [],
      // 分類は2つとも show_in_rest 済: column-cat02=「カテゴリー」/ column-cat=「執筆スタッフ」。
      // カテゴリー(column-cat02)はAIが記事内容から1つ自動選択して付与する。
      categoryTaxonomy: 'column-cat02',
      aiSelectCategory: true,
      // 執筆スタッフ(column-cat)は内容と無関係なので固定の既定値「スタッフコラム」を毎回付与。
      staffTaxonomy: 'column-cat',
      staffTermName: 'スタッフコラム',
      // 本文画像を幅いっぱい(full)で挿入（タイトル合成画像をワイド表示）
      bodyImageFull: true,
      // 中古リノベは専用プラグイン/テーマスタイル非導入＋KSESでflex/position除去のため、
      // 自前(インライン)装飾で出力する: 吹き出し=枠付きコールアウト(box) / 目次=自前HTML /
      // 見出し・箇条書き=インライン装飾（list-style-type等KSES通過プロパティのみ使用）
      speechBalloonStyle: 'box',
      balloonAccent: '#2563eb',
      tocStyle: 'inline',
      headingStyle: 'inline',
      listStyle: 'inline',
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
      postType: 'blog',              // 現場ブログCPT（CPT UIでshow_in_rest有効化済 / rest_base=blog）
      defaultStatus: 'draft',
      categoryIds: [106],            // blog_tax「解体工事コラム」ターム
      categoryTaxonomy: 'blog_tax',  // カスタム分類のためRESTフィールド名を明示（既定はcategories）
      tagTaxonomy: 'blog_tag',       // ブログタグ（解体/建て替え）から自動マッチ
      speechBalloonStyle: 'inline',  // バルーンプラグイン非導入サイトのためインラインCSS吹き出し
      balloonAccent: '#f5a623',      // 吹き出しの枠色（サイトのオレンジ系に合わせる）
      // 吹き出しアバター: 解体作業員キャラ（kaitaiメディアID 2957）
      balloonAvatarUrl: 'https://jube-kaitai.com/cms/wp-content/uploads/2026/06/balloon-avatar-kaitai.png',
    },
    recommendConfig: {
      siteDescription: '千葉県・茨城県のローコスト解体工事専門店「じゅうべえの解体」',
      focusAreas: '家屋解体/住宅解体/解体費用相場/解体の流れ/補助金・助成金/アスベスト/廃棄物処理/近隣対策/見積もり/空き家解体など解体工事全般',
      consultant: '解体工事専門のSEO・AIOコンサルタント',
      excludeAreas: '新築・リフォーム・塗装・中古など解体工事以外のテーマ',
    },
  },

  // ---- サイト3: サンプル別サイト（フィールド名・タクソノミーが異なる例）----
  another_site: {
    siteId: 'another_site',
    siteName: 'another_site',
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
    // --- AIキーワードレコメンド設定 ---
    recommendConfig: {
      siteDescription: '千葉・茨城エリアの地域密着リフォーム会社',
      focusAreas: 'リフォーム全般',
      excludeAreas: 'none',
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
      'Unknown siteId: "' + siteId + '". Available: ' + Object.keys(SITE_CONFIGS).join(', ')
    );
  }

  const wp = base.wordpress || {};

  // 非WPサイト（貼付コード出力モード等）はWP接続情報の検証をスキップ
  const isNoWp = !!(wp.noWordpress) ||
    !!(base.columnConfig && base.columnConfig.outputMode === 'paste');

  // WP認証情報が不足していても throw しない（warn のみ）。理由:
  //   - キーワード提案・ジョブ作成（server.js）は WP 認証情報を必要としない
  //   - 実際のWP投稿はローカルworkerが自身の .env の認証情報で行うため、
  //     クラウド側(server.js/Render)にWPパスワードを置かなくてよい運用
  //   （XSERVERは海外IPをブロックするため、投稿は必ずローカルworker経由）
  // 認証情報が本当に未設定のまま投稿された場合は、投稿時にWP側エラー（401等）となる。
  if (!isNoWp && (!wp.baseUrl || !wp.username || !wp.appPassword)) {
    console.warn(
      '[siteConfig] WP認証情報が不完全です (site="' + siteId + '"): baseUrl / username / appPassword のいずれか未設定。' +
      '投稿はローカルworkerの .env 認証情報で実行されます。'
    );
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
