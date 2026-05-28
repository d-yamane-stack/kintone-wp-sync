'use strict';

/**
 * 汎用コラム生成プロンプトビルダー（業態別サイトの共通ベース）
 *
 * column_jube.js の構成を踏襲しつつ、会社名・業態・地域・テーマ範囲を
 * site パラメータで差し替えられるようにしたもの。
 * 各 column_<site>.js はこの関数に site 設定を渡す薄いラッパーとして実装する。
 *
 * @param {object} params              - 実行時パラメータ
 * @param {string} params.keyword      - メインキーワード
 * @param {boolean}[params.directTitle]- true ならタイトルにkeywordをそのまま使う
 * @param {string} [params.audience]   - 想定読者
 * @param {string} [params.tone]       - 文体
 * @param {string} [params.cta]        - CTA文言
 * @param {string[]}[params.exampleTitles] - 公開済みタイトル例
 * @param {object} site                - サイト別設定
 * @param {string} site.company        - 会社/ブランド名（例: "ハウジング重兵衛"）
 * @param {string} site.role           - ライターの立場（例: "リフォーム会社「ハウジング重兵衛」のウェブサイト向けコンテンツライター"）
 * @param {string} site.region         - 対象地域（例: "千葉・茨城"）
 * @param {string} site.focus          - 扱うテーマの範囲（1文）
 * @param {string} [site.exclude]      - 扱わないテーマ（任意・1文）
 * @param {string} [site.headingClass] - H2クラス名（デフォルト: 'is-style-heading'）
 * @param {string} [site.listClass]    - リストクラス名（デフォルト: 'is-style-ul-style1'）
 */
function buildGenericColumnPrompt(params, site) {
  var keyword       = params.keyword       || '';
  var directTitle   = params.directTitle   || false;
  var audience      = params.audience      || '一般のお客様';
  var tone          = params.tone          || '親しみやすく丁寧';
  var cta           = params.cta           || '無料相談はこちら';
  var exampleTitles = params.exampleTitles || [];

  var company      = site.company      || '当社';
  var role         = site.role         || (company + 'のウェブサイト向けコンテンツライター');
  var region       = site.region       || '';
  var focus        = site.focus        || '';
  var exclude      = site.exclude      || '';
  var headingClass = site.headingClass || 'is-style-heading';
  var listClass    = site.listClass    || 'is-style-ul-style1';

  var regionLine = region ? ('- 地域名は「' + region + '」のみ使用可（区市名は入れない）\n') : '';
  var regionSeo  = region ? ('- ' + region + 'エリアの地域密着を意識した内容にすること\n') : '';

  // 既存公開タイトルを参考例として組み込む
  var exampleTitleBlock = '';
  if (exampleTitles.length > 0) {
    exampleTitleBlock =
      '## 【重要】タイトルスタイル参考例\n' +
      '以下は実際に公開しているコラムのタイトルです。文体・トーン・構造を必ず参考にすること:\n' +
      exampleTitles.slice(0, 10).map(function(t) { return '  ・' + t; }).join('\n') + '\n\n';
  }

  return 'あなたは' + role + 'です。\n' +
    '以下の条件とルールに従い、SEO・AIOSEO対策済みのコラム記事を作成してください。\n\n' +

    '【メインキーワード】' + keyword + '\n' +
    '【想定読者】' + audience + '\n' +
    '【文体・トーン】' + tone + '\n' +
    '【CTA文言】' + cta + '\n' +
    '【このサイトで扱うテーマ】' + focus + '\n' +
    (exclude ? ('【扱わないテーマ】' + exclude + '\n') : '') + '\n' +

    exampleTitleBlock +

    (directTitle
      ? '## 【最重要】pageTitle の指定\n' +
        '- pageTitle には必ず「' + keyword + '」をそのまま使用すること\n' +
        '- 一文字も変更・省略・追加禁止\n\n'
      : '') +
    '## タイトル作成ルール（最重要）\n' +
    '- タイトルは30〜50文字\n' +
    '- 「知らないと損！」「プロが教える」「必見」「徹底解説」「〜選」「驚きの」「実は〜」など読者の興味を引くフック表現を必ず使うこと\n' +
    '- 疑問形（「〜って何？」「〜はいくら？」）・感嘆符（！）・鉤括弧「」を積極活用\n' +
    '- 数字（費用目安・ポイント数など）を入れるとクリック率が上がる\n' +
    regionLine +
    '- 上記の参考タイトル例の雰囲気・リズムを踏襲すること\n\n' +

    '## 文字数・SEOルール\n' +
    '- 本文合計（導入＋全セクション本文＋まとめ）は1500文字以上にすること\n' +
    '- メインキーワードをタイトル・導入・H2見出し・本文中に自然に散りばめること\n' +
    '- metaDescriptionは120文字前後。キーワードを冒頭に含めること\n' +
    regionSeo +
    '- 専門外のテーマ（' + (exclude || '無関係な分野') + '）には踏み込まないこと\n\n' +

    '## 構成ルール（実際のサイトの記事構成に合わせること）\n\n' +

    '### 導入文（introLines）\n' +
    '- pタグ2〜3段落分の導入文を書く\n' +
    '- 1段落目: 読者の悩み・問題提起（「〜していませんか？」など共感を引く書き出し）\n' +
    '- 2段落目: この記事で解決できることの予告\n' +
    '- 3段落目: 「今回は〜をわかりやすく解説します。」で締める\n\n' +

    '### スピーチバルーン（speechBalloon）\n' +
    '- 「この記事は、次の人におすすめです！」の書き出しで始める\n' +
    '- 対象読者を「・」箇条書きで3〜4項目列挙する\n\n' +

    '### 本文セクション（headings）\n' +
    '- H2見出しを3〜4個作成すること（まとめを除く）\n' +
    '- H2の冒頭には必ず番号を付ける（例: "1 ' + (keyword || 'テーマ') + 'の基本とは"）\n' +
    '- H2クラス名は必ず "' + headingClass + '" にすること\n' +
    '- 各H2セクションの構成:\n' +
    '  1. body: 本文段落を2〜3段落（各段落50〜200文字）\n' +
    '  2. listItems: そのセクションの要点を箇条書き3項目（各1〜2文）\n' +
    '  3. listClass: "' + listClass + '"\n\n' +

    '### まとめ（summary）\n' +
    '- H2「まとめ」（クラスなし）\n' +
    '- 記事全体の要点を読者に役立つ形でまとめる段落1〜2個\n' +
    '- 【重要】会社の宣伝・営業トーク・「' + company + 'は〜」などの自社アピールは一切入れないこと\n' +
    '- 【重要】「お問い合わせください」「無料相談はこちら」などのCTA文句はsummaryに入れないこと（ctaSectionで別途扱う）\n' +
    '- 読者が次のアクションを自然にイメージできる締めくくりにする\n\n' +

    '## 出力形式\n' +
    '以下のJSON形式のみで返答してください（コードブロック不要）：\n' +
    '{\n' +
    '  "pageTitle": "SEO最適化されたタイトル（30〜50文字）",\n' +
    '  "metaDescription": "メタディスクリプション（120文字前後、キーワードを冒頭に）",\n' +
    '  "introLines": [\n' +
    '    "導入段落1（読者の悩みへの問いかけ）",\n' +
    '    "導入段落2（記事で解決できることの予告）",\n' +
    '    "導入段落3（今回は〜を解説します。）"\n' +
    '  ],\n' +
    '  "speechBalloon": "この記事は、次の人におすすめです！\\n・対象読者1\\n・対象読者2\\n・対象読者3",\n' +
    '  "headings": [\n' +
    '    {\n' +
    '      "level": 2,\n' +
    '      "cssClass": "' + headingClass + '",\n' +
    '      "text": "1 見出しテキスト（数字プレフィックス必須）",\n' +
    '      "body": "本文段落1。\\n\\n本文段落2。\\n\\n本文段落3。",\n' +
    '      "listItems": ["ポイント1（1〜2文）", "ポイント2（1〜2文）", "ポイント3（1〜2文）"],\n' +
    '      "listClass": "' + listClass + '"\n' +
    '    }\n' +
    '  ],\n' +
    '  "summary": {\n' +
    '    "text": "まとめ段落1。\\n\\nまとめ段落2。"\n' +
    '  },\n' +
    '  "ctaSection": "記事末尾のCTA文章（100文字前後）"\n' +
    '}';
}

module.exports = { buildGenericColumnPrompt };
