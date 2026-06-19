import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildRewritePrompt, buildRewriteHtml, parseGenerated, stripCodeFences, rewriteHtmlOptsForSite, bumpTitleYear } from '@/lib/rewriteHtml';

export const maxDuration = 60;

// 429（レート上限）を捕捉し retry-after を尊重して1回だけ再試行する。
// 最大待機は20秒に制限（maxDuration内で本リクエストを完走させるため）。
async function callAnthropicWithRetry(payload, apiKey) {
  const MAX_WAIT_SEC = 20;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.status !== 429 || attempt === 1) return res;
    const ra      = parseInt(res.headers.get('retry-after') || '', 10);
    const waitSec = Math.min(Math.max(isNaN(ra) ? 15 : ra, 1), MAX_WAIT_SEC);
    console.warn(`[Anthropic 429] rate limit, retry once after ${waitSec}s`);
    await new Promise(r => setTimeout(r, waitSec * 1000));
  }
}

// POST /api/column-analysis/rewrite-execute
// Body: { title, outline, keyPoints, category, siteId }
// Returns: { success, content (HTML) }
export async function POST(request) {
  try {
    const body = await request.json();
    const { title = '', outline = [], keyPoints = [], category = '', siteId = 'jube',
            originalTitle = '', originalUrl = '', originalDate = '', originalPosition = null,
            autoPost = false, wpPostId = null } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'タイトルが必要です' }, { status: 400 });
    }

    // タイトルの古い年号（例: 2024年版）を最新年へ更新してから生成・保存・公開に使う
    const finalTitle = bumpTitleYear(title);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    // コラム生成と同じ「構成JSON」を生成 → サイト標準フォーマット（導入文/吹き出し/目次/
    // is-style-heading見出し/まとめ/CTA）のGutenberg本文を組み立てる（lib/rewriteHtml）。
    // 本文側も年号を最新化（buildRewritePrompt 内で currentYear を指示）。
    const prompt = buildRewritePrompt({ title: finalTitle, category, outline, keyPoints });

    const res = await callAnthropicWithRetry({
      model:      'claude-haiku-4-5',
      max_tokens: 6000,
      messages:   [{ role: 'user', content: prompt }],
    }, apiKey);

    if (!res.ok) {
      const errText = await res.text();
      let detail = '';
      try { detail = JSON.parse(errText)?.error?.message || errText.slice(0, 200); } catch { detail = errText.slice(0, 200); }
      return NextResponse.json(
        { success: false, error: `Anthropic API エラー: ${res.status} - ${detail}` },
        { status: 502 }
      );
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text || '';

    // 構成JSON → 本文HTML。万一パースできなくても、フェンス除去した素のHTMLにフォールバック。
    let content;
    try {
      const generated = parseGenerated(rawText);
      content = buildRewriteHtml(generated, rewriteHtmlOptsForSite(siteId));
    } catch (parseErr) {
      console.warn('[rewrite-execute] 構成JSONのパース失敗、素のHTMLで継続:', parseErr.message);
      content = stripCodeFences(rawText);
    }

    // コスト記録
    prisma.seoFetchLog.create({ data: { siteId: 'ca_rewrite_exec', status: 'success', count: 1 } }).catch(() => {});

    // リライト結果を保存。
    //  - autoPost=true : jobType:'rewrite_post' / status:'pending' で登録 → ローカルworker（国内IP）が
    //    既存記事を上書き＋公開する（XSERVER等の海外IPブロック回避のためworker経由）。
    //  - autoPost=false: 従来どおり 'rewrite'/'done'（履歴のみ・手動コピー用）。
    let savedId = null;
    let queued  = false;
    try {
      await prisma.site.upsert({
        where:  { siteId },
        update: {},
        create: { siteId, siteName: siteId, wpBaseUrl: '', wpUsername: '', wpAppPassword: '', wpPostType: 'post' },
      });
      const job = await prisma.contentJob.create({
        data: {
          siteId,
          jobType:    autoPost ? 'rewrite_post' : 'rewrite',
          status:     autoPost ? 'pending' : 'done',
          finishedAt: autoPost ? null : new Date(),
          meta: {
            kind: 'rewrite', autoPost: !!autoPost, siteId,
            originalTitle, originalUrl, originalDate, originalPosition, url: originalUrl,
            wpPostId: wpPostId || null, category, newTitle: finalTitle,
          },
          contentItems: {
            create: {
              sourceType:     'rewrite',
              rawInput:       { originalTitle, originalUrl, category, wpPostId: wpPostId || null },
              generatedTitle: finalTitle,
              generatedBody:  content,
              status:         'generated',
            },
          },
        },
        include: { contentItems: { select: { id: true } } },
      });
      savedId = job.contentItems[0]?.id || job.id;
      queued  = !!autoPost;
    } catch (saveErr) {
      console.error('[API/column-analysis/rewrite-execute] 保存失敗（生成は成功）:', saveErr.message);
    }

    return NextResponse.json({ success: true, content, title: finalTitle, savedId, queued });
  } catch (err) {
    console.error('[API/column-analysis/rewrite-execute POST]', err);
    return NextResponse.json(
      { success: false, error: 'リライト生成に失敗しました: ' + err.message },
      { status: 500 }
    );
  }
}
