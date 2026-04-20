'use strict';

/**
 * 塗装屋ぬりべえ向けコラム生成プロンプト（外壁塗装・屋根塗装専門）
 * promptKey: 'column_nurube'
 *
 * @param {object} params
 * @param {string} params.keyword   - メインキーワード（例: "外壁塗装の色選び"）
 * @param {string} params.audience  - 想定読者（例: "外壁塗装を検討中の40〜60代の方"）
 * @param {string} params.tone      - 文体（例: "親しみやすく丁寧"）
 * @param {string} [params.cta]     - CTA文言（例: "無料見積はこちら"）
 * @param {string[]} [params.exampleTitles] - 既存公開コラムタイトル（スタイル参考用）
 */
function buildPrompt(params) {
  var keyword       = params.keyword       || '';
  var directTitle   = params.directTitle   || false;
  var audience      = params.audience      || '一般のお客様';
  var tone          = params.tone          || '親しみやすく丁寧';
  var cta           = params.cta           || '無料見積はこちら';
  var exampleTitles = params.exampleTitles || [];

  // 既存公開タイトルを参考例として組み込む
  var exampleTitleBlock = '';
  if (exampleTitles.length > 0) {
    exampleTitleBlock =
      '## 【重要】タイトルスタイル参考例\n' +
      '以下は実際に公開しているコラムのタイトルです。文体・トーン・構造を必ず参考にすること:\n' +
      exampleTitles.slice(0, 10).map(function(t) { return '  ・' + t; }).join('\n') + '\n\n';
  }

  return 'あなたは外壁塗装・屋根塗装専門店「塗装屋ぬりべえ」のウェブサイト向けコンテンツライターです。\n' +
    '以下の条件とルールに従い、SEO・AIOSEO対策済みのコラム記事を作成してください。\n\n' +

    '【メインキーワード】' + keyword + '\n' +
    '【想定読者】' + audience + '\n' +
    '【文体・トーン】' + tone + '\n' +
    '【CTA文言】' + cta + '\n\n' +

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
    '- 数字（費用目安・年数・ポイント数など）を入れるとクリック率が上がる\n' +
    '- 地域名は「千葉・茨城」のみ使用可（区市名は入れない）\n' +
    '- 上記の参考タイトル例がある場合は、その雰囲気・リズムを踏襲すること\n\n' +

    '## 文字数・SEOルール\n' +
    '- 本文合計（導入＋全セクション本文＋まとめ）は1500文字以上にすること\n' +
    '- メインキーワードをタイトル・導入・H2見出し・本文中に自然に散りばめること\n' +
    '- metaDescriptionは120文字前後。キーワードを冒頭に含めること\n' +
    '- 千葉・茨城エリアの外壁塗装・屋根塗装専門店としての信頼感を意識した内容にすること\n' +
    '- 外壁塗装・屋根塗装以外のリフォーム（キッチン・浴室など）には触れないこと\n\n' +

    '## 構成ルール（実際のサイトの記事構成に合わせること）\n\n' +

    '### 導入文（introLines）\n' +
    '- pタグ2〜3段落分の導入文を書く\n' +
    '- 1段落目: 読者の悩み・問題提起（「〜していませんか？」など共感を引く書き出し）\n' +
    '- 2段落目: この記事で解決できることの予告\n' +
    '- 3段落目: 「今回は〜をわかりやすく解説します。」で締める\n\n' +

    '### スピーチバルーン（speechBalloon）\n' +
    '- 「この記事はこんな方におすすめ！」の書き出しで始める\n' +
    '- 対象読者を「・」箇条書きで2〜3項目列挙する\n\n' +

    '### 本文セクション（headings）\n' +
    '- H2見出しを3〜4個作成すること（まとめを除く）\n' +
    '- H2の冒頭には必ず番号を付ける（例: "1 外壁塗装の費用相場とは"）\n' +
    '- H2クラス名は必ず "is-style-heading-type-1" にすること\n' +
    '- 各H2セクションの構成:\n' +
    '  1. body: 本文段落を2〜3段落（各段落50〜200文字）\n' +
    '  2. listItems: そのセクションの要点を箇条書き3項目（各1〜2文）\n' +
    '  3. listClass: "is-style-ul-style1"\n\n' +

    '### まとめ（summary）\n' +
    '- H2「まとめ」（クラスなし）\n' +
    '- 記事全体の要点を読者に役立つ形でまとめる段落1〜2個\n' +
    '- 【重要】会社の宣伝・営業トーク・「ぬりべえは〜」などの自社アピールは一切入れないこと\n' +
    '- 【重要】「お問い合わせください」「無料見積はこちら」などのCTA文句はsummaryに入れないこと（ctaSectionで別途扱う）\n' +
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
    '      "cssClass": "is-style-heading-type-1",\n' +
    '      "text": "1 見出しテキスト（数字プレフィックス必須）",\n' +
    '      "body": "本文段落1。\\n\\n本文段落2。\\n\\n本文段落3。",\n' +
    '      "listItems": ["ポイント1（1〜2文）", "ポイント2（1〜2文）", "ポイント3（1〜2文）"],\n' +
    '      "listClass": "is-style-ul-style1"\n' +
    '    }\n' +
    '  ],\n' +
    '  "summary": {\n' +
    '    "text": "まとめ段落1。\\n\\nまとめ段落2。"\n' +
    '  },\n' +
    '  "ctaSection": "記事末尾のCTA文章（100文字前後）"\n' +
    '}';
}

module.exports = { buildPrompt };
