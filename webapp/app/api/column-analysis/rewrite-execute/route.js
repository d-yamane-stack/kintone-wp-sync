import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const maxDuration = 60;

// POST /api/column-analysis/rewrite-execute
// Body: { title, outline, keyPoints, category, siteId }
// Returns: { success, content (HTML) }
export async function POST(request) {
  try {
    const body = await request.json();
    const { title = '', outline = [], keyPoints = [], category = '', siteId = 'jube' } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'タイトルが必要です' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const outlineText = outline.map((s, i) =>
      `## ${i + 1}. ${s.section}\n指示: ${s.content}`
    ).join('\n\n');

    const keyPointsText = keyPoints.map(k => `- ${k}`).join('\n');

    const prompt = `あなたは住宅リフォーム専門のSEOライターです。
以下の構成に従って、読者に価値ある記事を執筆してください。

【記事タイトル】
${title}

${category ? `【カテゴリ】\n${category}\n` : ''}
【記事構成（この順番・内容で執筆すること）】
${outlineText}

【強調すべきポイント】
${keyPointsText}

【執筆ルール】
- 各セクションは400〜600文字程度（具体的かつ読みやすく）
- 具体的な事例・数字・アドバイスを含める
- 読者がすぐに行動できる実践的な内容
- 最後のセクション後に「まとめ・無料相談への誘導」を追加
- HTML形式で出力（<h2>, <p>, <ul>, <li> タグを使用）
- タイトル（<h1>）は含めない・コードブロック不要

記事本文のHTMLのみを出力してください。`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5',
        max_tokens: 6000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let detail = '';
      try { detail = JSON.parse(errText)?.error?.message || errText.slice(0, 200); } catch { detail = errText.slice(0, 200); }
      return NextResponse.json(
        { success: false, error: `Anthropic API エラー: ${res.status} - ${detail}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '';

    // コスト記録
    prisma.seoFetchLog.create({ data: { siteId: 'ca_rewrite_exec', status: 'success', count: 1 } }).catch(() => {});
    return NextResponse.json({ success: true, content, title });
  } catch (err) {
    console.error('[API/column-analysis/rewrite-execute POST]', err);
    return NextResponse.json(
      { success: false, error: 'リライト生成に失敗しました: ' + err.message },
      { status: 500 }
    );
  }
}
