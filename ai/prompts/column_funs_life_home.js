'use strict';

/**
 * funs life home（新築注文住宅・非WP）向けコラム生成プロンプト
 * promptKey: 'column_funs_life_home'
 *
 * funs life home の独自CMSの貼付フォーマット（.h1/.spc/目次/<%image1s%>トークン）に
 * 合わせるため、専用の構造化JSONを生成する。HTML整形は pipelines/column.js の
 * buildFunsLifeHomeHtml が担当する。
 *
 * @param {object} params
 * @param {string} params.keyword       - メインキーワード
 * @param {boolean}[params.directTitle] - true ならタイトルにkeywordをそのまま使う
 * @param {string} [params.audience]    - 想定読者
 * @param {string} [params.tone]        - 文体
 */
function buildPrompt(params) {
  var keyword     = params.keyword     || '';
  var directTitle = params.directTitle || false;
  var audience    = params.audience    || 'これから家を建てる方';
  var tone        = params.tone        || '親しみやすく丁寧';

  return 'あなたは新築注文住宅ブランド「ファンズライフホーム（funs life home）」のウェブサイト向けコンテンツライターです。\n' +
    '千葉・茨城エリアで注文住宅・二世帯住宅・平屋住宅を手がける工務店のSEO/AIO対策済みコラムを作成してください。\n\n' +

    '【メインキーワード】' + keyword + '\n' +
    '【想定読者】' + audience + '\n' +
    '【文体・トーン】' + tone + '\n\n' +

    (directTitle
      ? '## 【最重要】pageTitle の指定\n' +
        '- pageTitle には必ず「' + keyword + '」をそのまま使用すること（一文字も変更禁止）\n\n'
      : '') +

    '## タイトル（pageTitle）ルール\n' +
    '- 30〜50文字。「知らないと損！」「プロが教える」「徹底解説」「〜選」などのフック表現を使う\n' +
    '- 疑問形・感嘆符（！）・鉤括弧「」を活用。地域名は「千葉・茨城」のみ（区市名はタイトルに入れない）\n\n' +

    '## 地域密着SEO（最重要）\n' +
    '- 本文（body）の随所に、千葉・茨城の市町村名を自然に織り込むこと\n' +
    '- 使ってよい地名の例: 佐倉市・八街市・成田市・富里市・山武市・神栖市・香取市・香取郡多古町・潮来市・稲敷市・鹿嶋市・印西市・茨城県・千葉県\n' +
    '- 各セクションに1〜2個、地名を絡めた具体例を入れる（例:「神栖市や香取郡多古町など二世帯住宅の多い地域では〜」）\n\n' +

    '## 構成（この順序・要素で生成すること）\n' +
    '1. greeting: 「新築一戸建て・注文住宅・二世帯住宅・平屋住宅・リフォームをご検討中の皆さま、こんにちは♪」のような、サービスを列挙した挨拶文（末尾は「こんにちは♪」）\n' +
    '2. introLines: 導入文を3行（spc枠に入る。1行目=記事の予告、2行目=読者メリット、3行目=「たとえば、千葉県の◯◯市や◯◯市などで検討中の方にもおすすめの内容です。」のように地名を入れる）\n' +
    '3. headings: H2見出しを4個。\n' +
    '   - 1個目: 「なぜ〜なの？」のような問題提起（body段落で解説、listItemsは空配列）\n' +
    '   - 2個目: 「〜のポイント」のような実践解説（listItemsに3項目。各項目は「小見出し\\n詳細説明」の形式。bodyは空文字）\n' +
    '   - 3個目: 「将来に備える〜」のような将来視点（body段落で解説、listItemsは空配列）\n' +
    '   - 4個目: 必ず「ファンズライフホームでできること」（自社の強み・対応を紹介。body段落、listItemsは空配列）\n\n' +

    '## 文字数\n' +
    '- 本文合計1500文字以上。各bodyは2〜4文を「\\n」区切りで。metaDescriptionは120文字前後でキーワードを冒頭に。\n\n' +

    '## SEO URL（urlSlug）\n' +
    '- 記事内容を表す英語のハイフン区切りスラッグ（例: gentle-stairs-home, custom-home-cost）。日本語・スペース不可。\n\n' +

    '## 出力形式（このJSONのみ。コードブロック不要）\n' +
    '{\n' +
    '  "pageTitle": "SEO最適化タイトル（30〜50文字）",\n' +
    '  "metaDescription": "メタディスクリプション（120文字前後、キーワードを冒頭に）",\n' +
    '  "urlSlug": "english-hyphenated-slug",\n' +
    '  "greeting": "新築一戸建て・注文住宅・二世帯住宅・平屋住宅・リフォームをご検討中の皆さま、こんにちは♪",\n' +
    '  "introLines": [\n' +
    '    "導入1行目（記事の予告）",\n' +
    '    "導入2行目（読者メリット）",\n' +
    '    "導入3行目（地名を入れたおすすめ訴求）"\n' +
    '  ],\n' +
    '  "headings": [\n' +
    '    { "text": "なぜ〜なの？", "body": "段落1。\\n段落2（地名を含む）。", "listItems": [] },\n' +
    '    { "text": "〜のポイント", "body": "", "listItems": ["小見出しA\\n詳細説明A", "小見出しB\\n詳細説明B（地名を含む）", "小見出しC\\n詳細説明C"] },\n' +
    '    { "text": "将来に備える〜", "body": "段落1。\\n段落2（地名を含む）。", "listItems": [] },\n' +
    '    { "text": "ファンズライフホームでできること", "body": "自社の強み1。\\n自社の強み2（地名を含む）。\\n締めの一言。", "listItems": [] }\n' +
    '  ]\n' +
    '}';
}

module.exports = { buildPrompt };
