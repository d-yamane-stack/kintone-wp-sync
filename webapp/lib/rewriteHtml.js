'use strict';

/**
 * コラム「リライト」専用の本文HTMLビルダー & 構成プロンプト。
 *
 * 目的: リライト後の記事を、コラム生成（pipelines/column.js の buildHtmlContent /
 * ai/prompts/column_jube.js）と完全に同じトンマナ＝
 *   導入文 → スピーチバルーン → 目次([toc]) → 本文(is-style-heading見出し) → まとめ → CTA
 * で出力する。これにより「リード文・吹き出し・目次が無い／冒頭にHTMLが見える」問題を解消する。
 *
 * webapp(Next/ESM)からは  import { buildRewriteHtml } from '@/lib/rewriteHtml'
 * 既存記事の一括修正スクリプト(CommonJS)からは require('.../webapp/lib/rewriteHtml')
 * の双方から使うため CommonJS で記述している（webapp/package.json は commonjs）。
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// AIが ```html ... ``` で囲んで返した場合などのコードフェンス／前後ゴミを除去する。
// （これが「記事冒頭にHTMLが付いている」原因だった）
function stripCodeFences(s) {
  if (!s) return '';
  return String(s)
    .trim()
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
}

// Claudeのテキスト応答から最初の { 〜 最後の } を取り出してJSONパースする。
function parseGenerated(text) {
  const cleaned = stripCodeFences(text);
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON応答が見つかりません');
  return JSON.parse(cleaned.slice(s, e + 1));
}

/**
 * サイトごとの本文フォーマット差分（pipelines/column.js / siteConfigs.js と整合）。
 *  - jube/新築/中古: 既定（is-style-heading見出し ＋ LIQUID SPEECH BALLOON の html吹き出し）
 *  - nurube:         is-style-heading-type-1 ＋ word_balloon ショートコード
 *  - kaitai:         インラインCSS吹き出し（バルーンプラグイン非導入）
 */
function rewriteHtmlOptsForSite(siteId) {
  if (siteId === 'nurube') {
    return { headingClass: 'is-style-heading-type-1', speechBalloonStyle: 'shortcode' };
  }
  if (siteId === 'kaitai') {
    return {
      speechBalloonStyle: 'inline',
      balloonAccent:      '#f5a623',
      balloonAvatarUrl:   'https://jube-kaitai.com/cms/wp-content/uploads/2026/06/balloon-avatar-kaitai.png',
    };
  }
  return {}; // jube ほか → 既定値
}

/**
 * generated（構成JSON） → Gutenbergブロック形式のWP本文HTML。
 * pipelines/column.js の buildHtmlContent と同じ出力構造（画像挿入だけは行わない＝
 * 既存記事のアイキャッチ等はそのまま残す）。
 *
 * @param {object} generated - { introLines[], speechBalloon, headings[], summary, ctaSection }
 * @param {object} [opts]    - { headingClass, summaryHeadingClass, speechBalloonStyle,
 *                              balloonAccent, balloonAvatarUrl, listClass, includeToc, disableCta }
 */
function buildRewriteHtml(generated, opts) {
  opts = opts || {};
  const headingClass        = opts.headingClass || 'is-style-heading';
  const summaryHeadingClass = Object.prototype.hasOwnProperty.call(opts, 'summaryHeadingClass')
    ? opts.summaryHeadingClass
    : headingClass;
  const speechBalloonStyle  = opts.speechBalloonStyle || 'html';
  const listClassDefault    = opts.listClass || 'is-style-ul-style1';
  const includeToc          = opts.includeToc !== false;
  const disableCta          = !!opts.disableCta;
  const parts = [];

  // 導入文
  if (Array.isArray(generated.introLines)) {
    generated.introLines.forEach(function (line) {
      if (line) parts.push('<!-- wp:paragraph -->\n<p>' + escapeHtml(line) + '</p>\n<!-- /wp:paragraph -->');
    });
  }

  // スピーチバルーン
  if (generated.speechBalloon) {
    if (speechBalloonStyle === 'shortcode') {
      const balloonText = String(generated.speechBalloon).trim();
      parts.push(
        '<!-- wp:shortcode -->\n' +
        '[word_balloon id="mystery_men" size="M" position="L" name_position="under_avatar" radius="true" name="false"' +
        ' balloon="talk" balloon_shadow="true" icon_type="question" icon_position="top_left" icon_size="M"]\n' +
        balloonText + '\n[/word_balloon]\n' +
        '<!-- /wp:shortcode -->'
      );
    } else if (speechBalloonStyle === 'inline') {
      const accent = opts.balloonAccent || '#f5a623';
      const avatarInner = opts.balloonAvatarUrl
        ? '<img src="' + opts.balloonAvatarUrl + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">'
        : '<svg width="32" height="32" viewBox="0 0 24 24" fill="' + accent + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 12c2.65 0 4.8-2.15 4.8-4.8S14.65 2.4 12 2.4 7.2 4.55 7.2 7.2 9.35 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';
      const inlineLines = String(generated.speechBalloon).split('\n').map(escapeHtml).join('<br>');
      parts.push(
        '<!-- wp:html -->\n' +
        '<div style="display:flex;align-items:flex-start;gap:12px;margin:1.5em 0;">\n' +
        '<div style="flex:0 0 56px;width:56px;height:56px;border-radius:50%;background:#fff;border:2px solid ' + accent + ';display:flex;align-items:center;justify-content:center;overflow:hidden;">' + avatarInner + '</div>\n' +
        '<div style="position:relative;flex:1;background:#fff;border:2px solid ' + accent + ';border-radius:10px;padding:14px 18px;">\n' +
        '<span style="position:absolute;left:-11px;top:18px;width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;border-right:11px solid ' + accent + ';"></span>' +
        '<span style="position:absolute;left:-7px;top:20px;width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-right:9px solid #fff;"></span>\n' +
        '<p style="margin:0;line-height:1.9;">' + inlineLines + '</p>\n' +
        '</div>\n</div>\n' +
        '<!-- /wp:html -->'
      );
    } else {
      // html（既定）: 重兵衛形式 — LIQUID SPEECH BALLOON プラグインのCSSに依存
      const balloonLines = String(generated.speechBalloon).split('\n').map(escapeHtml).join('<br>');
      parts.push(
        '<!-- wp:html -->\n' +
        '<div class="wp-block-liquid-speech-balloon liquid-speech-balloon-wrap liquid-speech-balloon-00">\n' +
        '<div class="liquid-speech-balloon-avatar">&nbsp;</div>\n' +
        '<div class="liquid-speech-balloon-text">\n' +
        '<p>' + balloonLines + '</p>\n' +
        '<div class="liquid-speech-balloon-arrow">&nbsp;</div>\n' +
        '</div>\n</div>\n' +
        '<!-- /wp:html -->'
      );
    }
  }

  // 目次（TOCプラグイン用ショートコード）
  if (includeToc) {
    parts.push('<!-- wp:shortcode -->\n[toc]\n<!-- /wp:shortcode -->');
  }

  // 本文セクション
  if (Array.isArray(generated.headings)) {
    generated.headings.forEach(function (h) {
      const level    = h.level || 2;
      const cssClass = h.cssClass || headingClass;
      parts.push(
        '<!-- wp:heading {"level":' + level + ',"className":"' + cssClass + '"} -->\n' +
        '<h' + level + ' class="' + cssClass + '">' + escapeHtml(h.text) + '</h' + level + '>\n' +
        '<!-- /wp:heading -->'
      );
      if (h.body) {
        String(h.body).split(/\n\n+/).forEach(function (para) {
          const t = para.trim();
          if (t) parts.push('<!-- wp:paragraph -->\n<p>' + escapeHtml(t) + '</p>\n<!-- /wp:paragraph -->');
        });
      }
      if (Array.isArray(h.listItems) && h.listItems.length > 0) {
        const listClass = h.listClass || listClassDefault;
        const lis = h.listItems.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
        parts.push(
          '<!-- wp:list {"className":"' + listClass + '"} -->\n' +
          '<ul class="' + listClass + '">' + lis + '</ul>\n' +
          '<!-- /wp:list -->'
        );
      }
    });
  }

  // まとめ
  if (generated.summary) {
    parts.push(
      summaryHeadingClass
        ? '<!-- wp:heading {"className":"' + summaryHeadingClass + '"} -->\n<h2 class="' + summaryHeadingClass + '">まとめ</h2>\n<!-- /wp:heading -->'
        : '<!-- wp:heading -->\n<h2>まとめ</h2>\n<!-- /wp:heading -->'
    );
    const summaryText = generated.summary.text || generated.summary;
    if (typeof summaryText === 'string' && summaryText) {
      summaryText.split(/\n\n+/).forEach(function (para) {
        const t = para.trim();
        if (t) parts.push('<!-- wp:paragraph -->\n<p>' + escapeHtml(t) + '</p>\n<!-- /wp:paragraph -->');
      });
    }
  }

  // CTA
  if (!disableCta && generated.ctaSection) {
    parts.push('<!-- wp:paragraph -->\n<p>' + escapeHtml(generated.ctaSection) + '</p>\n<!-- /wp:paragraph -->');
  }

  return parts.join('\n\n');
}

/**
 * コラム画像（wp:imageブロック）を組み立てる。pipelines/column.js と同じ形式。
 */
function imageBlockHtml(imageId, imageUrl, alt) {
  if (!imageId || !imageUrl) return '';
  return '<!-- wp:image {"id":' + imageId + ',"sizeSlug":"large","linkDestination":"none"} -->\n' +
    '<figure class="wp-block-image size-large"><img src="' + imageUrl + '" alt="' + escapeHtml(alt || '') + '" class="wp-image-' + imageId + '"/></figure>\n' +
    '<!-- /wp:image -->';
}

/**
 * リライト本文HTMLの「吹き出し直下・目次の直前」（コラム生成と同じ位置）に画像ブロックを挿入する。
 * 既に本文へ画像がある場合は二重挿入しない。[toc]が無ければ最初の見出しの前に挿入。
 */
function injectInlineImage(html, imageId, imageUrl, alt) {
  const block = imageBlockHtml(imageId, imageUrl, alt);
  if (!block) return html;
  if (/<!--\s*wp:image/.test(html)) return html; // 既に画像あり → 二重挿入回避
  const tocMarker = '<!-- wp:shortcode -->\n[toc]\n<!-- /wp:shortcode -->';
  if (html.indexOf(tocMarker) !== -1) {
    return html.replace(tocMarker, block + '\n\n' + tocMarker);
  }
  const hIdx = html.indexOf('<!-- wp:heading');
  if (hIdx !== -1) return html.slice(0, hIdx) + block + '\n\n' + html.slice(hIdx);
  return block + '\n\n' + html;
}

/**
 * リライト本文の「構成JSON」を生成させるプロンプト。
 * ai/prompts/column_jube.js と同じ出力スキーマ（introLines / speechBalloon / headings / summary / ctaSection）。
 *
 * @param {object} opts - { title(=pageTitle固定), category, existingText, outline[], keyPoints[], exampleTitles[] }
 */
function buildRewritePrompt(opts) {
  opts = opts || {};
  const title         = opts.title || '';
  const category      = opts.category || '';
  const existingText  = opts.existingText || '';
  const outline       = Array.isArray(opts.outline) ? opts.outline : [];
  const keyPoints     = Array.isArray(opts.keyPoints) ? opts.keyPoints : [];
  const exampleTitles = Array.isArray(opts.exampleTitles) ? opts.exampleTitles : [];

  const outlineText = outline.map(function (s, i) {
    return '## ' + (i + 1) + '. ' + (s.section || '') + '\n指示: ' + (s.content || '');
  }).join('\n\n');
  const keyPointsText = keyPoints.map(function (k) { return '- ' + k; }).join('\n');
  const exampleBlock = exampleTitles.length
    ? '参考タイトル例（文体・リズムを踏襲）:\n' + exampleTitles.slice(0, 8).map(function (t) { return '・' + t; }).join('\n') + '\n\n'
    : '';

  return 'あなたはリフォーム会社「ハウジング重兵衛」のSEOコンテンツライターです。\n' +
    '既存のコラム記事を、サイト標準のフォーマット（導入文→スピーチバルーン→目次→本文→まとめ）に沿ってリライト（再構成）してください。\n\n' +

    '【記事タイトル（このまま pageTitle に使用すること）】\n' + title + '\n\n' +
    (category ? '【カテゴリ】' + category + '\n\n' : '') +
    (existingText ? '【既存記事の内容（この情報・要点を活かし、より分かりやすく具体的に再構成する）】\n' + existingText.slice(0, 3500) + '\n\n' : '') +
    (outlineText ? '【推奨構成】\n' + outlineText + '\n\n' : '') +
    (keyPointsText ? '【強調すべきポイント】\n' + keyPointsText + '\n\n' : '') +
    exampleBlock +

    '## 構成ルール（必ず守る）\n' +
    '- introLines: 導入段落を2〜3個（1=読者の悩みへの問いかけ／2=この記事で解決できることの予告／3=「今回は〜をわかりやすく解説します。」で締め）\n' +
    '- speechBalloon: 「この記事は、次の人におすすめです！」で始め、対象読者を「・」箇条書きで3〜4項目\n' +
    '- headings: H2見出しを3〜4個（まとめ除く）。各H2の冒頭に番号（例: "1 〜"）。cssClassは必ず "is-style-heading"。各見出しに body（2〜3段落・各50〜200文字）と listItems（要点3項目・listClass="is-style-ul-style1"）\n' +
    '- summary: H2「まとめ」。記事全体の要点。会社の宣伝・「お問い合わせください」等のCTAは入れない（ctaSectionで扱う）\n' +
    '- ctaSection: 記事末尾のCTA文（100文字前後・無料相談への誘導）\n' +
    '- 本文合計1500文字以上。具体的な数字・事例・実践的アドバイスを含める。千葉・茨城エリアの地域密着を意識\n\n' +

    '## 出力形式（以下のJSONのみで返答。コードブロックや説明文は一切不要）\n' +
    '{\n' +
    '  "pageTitle": ' + JSON.stringify(title) + ',\n' +
    '  "introLines": ["導入段落1", "導入段落2", "導入段落3"],\n' +
    '  "speechBalloon": "この記事は、次の人におすすめです！\\n・対象読者1\\n・対象読者2\\n・対象読者3",\n' +
    '  "headings": [\n' +
    '    { "level": 2, "cssClass": "is-style-heading", "text": "1 見出しテキスト", "body": "本文段落1。\\n\\n本文段落2。", "listItems": ["要点1", "要点2", "要点3"], "listClass": "is-style-ul-style1" }\n' +
    '  ],\n' +
    '  "summary": { "text": "まとめ段落1。\\n\\nまとめ段落2。" },\n' +
    '  "ctaSection": "記事末尾のCTA文（100文字前後）"\n' +
    '}';
}

module.exports = {
  escapeHtml,
  stripCodeFences,
  parseGenerated,
  buildRewriteHtml,
  buildRewritePrompt,
  rewriteHtmlOptsForSite,
  imageBlockHtml,
  injectInlineImage,
};
