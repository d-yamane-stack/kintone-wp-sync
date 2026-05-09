import { NextResponse } from 'next/server';
import { SITE_META } from '@/lib/siteMeta';

// サイト別カテゴリ候補
const CATEGORY_HINTS = {
  nurube: '"外壁塗装","屋根塗装","防水工事","コーキング補修","塗料・色選び","塗装工程","塗り替え時期","助成金・補助金","DIY・メンテナンス","会社情報","その他"',
  default: '"キッチンリフォーム","浴室リフォーム","トイレリフォーム","洗面リフォーム","内装・フローリング","窓・断熱","収納・間取り","外構・庭","屋根・外壁","水回り全般","補助金・費用","季節・メンテナンス","会社情報","その他"',
};

// POST /api/column-analysis/analyze
// { siteId, posts: [...], seoKeywords: [...] }
// Anthropic APIを直接呼び出してコラム分析
export async function POST(request) {
  try {
    const body       = await request.json();
    const posts      = Array.isArray(body.posts)       ? body.posts       : [];
    const seoKeywords = Array.isArray(body.seoKeywords) ? body.seoKeywords : [];
    const siteId     = body.siteId || 'jube';

    if (posts.length === 0) {
      return NextResponse.json({ success: false, error: '記事データがありません' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const siteMeta     = SITE_META[siteId] || SITE_META.jube;
    const categoryHint = CATEGORY_HINTS[siteId] || CATEGORY_HINTS.default;

    // SEOキーワードテキスト（上位20件）
    const seoKwText = seoKeywords.slice(0, 20).map(kw =>
      `- ${kw.keyword}${kw.position ? `（順位:${kw.position}位）` : '（圏外）'}`
    ).join('\n');

    // 記事リスト（最大80件）
    const postsText = posts.slice(0, 80).map((p, i) => {
      let line = `${i + 1}. タイトル: ${p.title}`;
      if (p.keyword) line += `\n   生成KW: ${p.keyword}`;
      if (p.excerpt) line += `\n   概要: ${p.excerpt.slice(0, 150)}`;
      if (p.date)    line += `\n   日付: ${p.date.slice(0, 10)}`;
      return line;
    }).join('\n\n');

    const prompt = `あなたはSEOコンテンツアナリストです。
サイト: ${siteMeta.name}

【分析対象コラム記事 ${Math.min(posts.length, 80)}件】
${postsText}

【現在のSEO追跡キーワード（参考）】
${seoKwText || 'なし'}

以下を分析してJSONで返してください:

1. articleCategories: 各記事のメインカテゴリをAIで判定。
   カテゴリ例: ${categoryHint}
   各記事に対して1つのカテゴリを割り当てること。idはそのまま文字列で返すこと。

2. rewriteCandidates: リライト優先度の高い記事（古い・内容が薄そう・SEOキーワードとのズレが大きい）を最大10件、具体的な理由付きで。

3. categoryGaps: このサイトのコラム群に不足しているカテゴリ・テーマを最大5件、理由付きで提案。

JSON形式のみで返答（コードブロック不要）:
{
  "articleCategories": [
    { "id": "記事ID文字列", "title": "タイトル", "url": "URL", "category": "カテゴリ名", "date": "日付" }
  ],
  "rewriteCandidates": [
    { "id": "記事ID文字列", "title": "タイトル", "url": "URL", "reason": "具体的なリライト理由", "priority": "high|medium" }
  ],
  "categoryGaps": [
    { "category": "カテゴリ名", "reason": "不足している理由と提案" }
  ]
}`;

    // Anthropic API 呼び出し
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[API/column-analysis/analyze] Anthropic error:', errText);
      return NextResponse.json(
        { success: false, error: `Anthropic API エラー: ${anthropicRes.status}` },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicRes.json();
    const text = anthropicData.content?.[0]?.text || '';

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return NextResponse.json({ success: true, result: parsed });
    } catch (e) {
      console.error('[API/column-analysis/analyze] JSON parse error:', text.slice(0, 300));
      return NextResponse.json(
        { success: false, error: 'AI応答の解析に失敗しました' },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('[API/column-analysis/analyze POST]', err);
    return NextResponse.json({ success: false, error: 'AI分析に失敗しました: ' + err.message }, { status: 500 });
  }
}
