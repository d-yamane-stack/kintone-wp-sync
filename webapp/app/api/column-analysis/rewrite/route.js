import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/column-analysis/rewrite
// Body: { title, url, excerpt, category, reason }
// Returns: { outline, keyPoints, titleSuggestions }
export async function POST(request) {
  try {
    const body = await request.json();
    const { title = '', url = '', excerpt = '', category = '', reason = '' } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'タイトルが必要です' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const prompt = `あなたは日本語のSEOコンテンツ専門家です。
以下の住宅リフォーム・リノベーション関連のコラム記事をリライトするための計画を作成してください。

【記事情報】
タイトル: ${title}
${url ? `URL: ${url}` : ''}
${category ? `カテゴリ: ${category}` : ''}
${excerpt ? `概要・冒頭: ${excerpt}` : ''}
${reason ? `リライトが必要な理由: ${reason}` : ''}

以下をJSON形式で返してください（コードブロック不要）:
{
  "outline": [
    { "section": "セクション名", "content": "このセクションに書くべき内容の説明（2〜3文）" }
  ],
  "keyPoints": ["強調すべきポイント1", "強調すべきポイント2", "強調すべきポイント3"],
  "titleSuggestions": ["改善タイトル案1", "改善タイトル案2", "改善タイトル案3"]
}

outline は4〜6セクション、keyPoints は3〜5個、titleSuggestions は3個を目安に。
SEO効果が高く、読者に価値ある内容を意識してください。`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[API/column-analysis/rewrite] Anthropic error:', errText);
      let detail = '';
      try { detail = JSON.parse(errText)?.error?.message || errText.slice(0, 200); } catch { detail = errText.slice(0, 200); }
      return NextResponse.json(
        { success: false, error: `Anthropic API エラー: ${res.status} - ${detail}` },
        { status: 502 }
      );
    }

    const anthropicData = await res.json();
    const text = anthropicData.content?.[0]?.text || '';

    try {
      const cleaned   = text.replace(/```json|```/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd   = cleaned.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('JSON not found');
      const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
      const parsed  = JSON.parse(jsonStr);
      // コスト記録
      prisma.seoFetchLog.create({ data: { siteId: 'ca_rewrite', status: 'success', count: 1 } }).catch(() => {});
      return NextResponse.json({ success: true, ...parsed });
    } catch (e) {
      console.error('[API/column-analysis/rewrite] JSON parse error. Raw:', text.slice(0, 500));
      return NextResponse.json(
        { success: false, error: 'AI応答の解析に失敗しました: ' + e.message },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('[API/column-analysis/rewrite POST]', err);
    return NextResponse.json(
      { success: false, error: 'リライト案生成に失敗しました: ' + err.message },
      { status: 500 }
    );
  }
}
