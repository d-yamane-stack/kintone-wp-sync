import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const USD_TO_JPY = 150;
// DataForSEO SERP API Live regular: $2/1,000件（1キーワード=1リクエスト）
const RANK_CHECK_UNIT_USD = 0.002;

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // コンテンツジョブ集計（deletedAt フィルタなし → ソフトデリート済みも含める）
    const jobs = await prisma.contentJob.findMany({
      where: { startedAt: { gte: monthStart }, jobType: { notIn: ['rewrite', 'rewrite_post'] } },
      select: { jobType: true, status: true, meta: true, _count: { select: { contentItems: true } } },
    });

    // コラムは常に現在の単価で計算（meta.costUsd は旧Sonnet単価が混在するため使わない）
    // 施工事例は meta.costUsd があればそれを優先
    const COLUMN_UNIT_USD    = 0.01; // Haiku 4.5 実績値
    const CASE_STUDY_UNIT_USD = 0.04;

    let estimatedUsd = 0;
    let columnJobs = 0;
    let caseStudyItems = 0;

    jobs.forEach((j) => {
      if (j.jobType === 'column') {
        columnJobs++;
        estimatedUsd += COLUMN_UNIT_USD;
      } else if (j.jobType === 'case_study') {
        const items = j._count.contentItems;
        caseStudyItems += items;
        const metaCost = j.meta?.costUsd;
        estimatedUsd += (typeof metaCost === 'number') ? metaCost : CASE_STUDY_UNIT_USD * items;
      }
    });

    // SEO順位チェック集計（当月）— seoFetchLog から集計
    // status='error'（部分失敗）でも count には成功して消費した件数が入るため、statusでは絞らない
    const seoLogs = await prisma.seoFetchLog.findMany({
      where:  { startedAt: { gte: monthStart } },
      select: { siteId: true, count: true },
    });
    // siteId が null の行が混在しても落ちないようガード（null → ''）
    const sid = (l) => l.siteId || '';
    const rankCheckCount = seoLogs.filter(l => !sid(l).startsWith('pdf_') && !sid(l).startsWith('ca_')).reduce((s, l) => s + (l.count || 0), 0);
    const rankCostUsd    = rankCheckCount * RANK_CHECK_UNIT_USD;
    estimatedUsd += rankCostUsd;

    // PDF生成集計（当月）
    const pdfCount    = seoLogs.filter(l => sid(l).startsWith('pdf_')).reduce((s, l) => s + (l.count || 0), 0);
    const pdfCostUsd  = pdfCount * 0.005; // Haiku 4.5: 入力800tok+出力1000tok ≈ $0.005/回
    estimatedUsd += pdfCostUsd;

    // コラム分析AI集計（当月）
    const caLogs = seoLogs.filter(l => sid(l).startsWith('ca_'));
    const analyzeCount     = caLogs.filter(l => sid(l).startsWith('ca_analyze')).reduce((s, l) => s + (l.count || 0), 0);
    const rewriteCount     = caLogs.filter(l => l.siteId === 'ca_rewrite').reduce((s, l) => s + (l.count || 0), 0);
    const rewriteExecCount = caLogs.filter(l => l.siteId === 'ca_rewrite_exec').reduce((s, l) => s + (l.count || 0), 0);
    const bestCount        = caLogs.filter(l => sid(l).startsWith('ca_best')).reduce((s, l) => s + (l.count || 0), 0);
    const caAnalyzeCostUsd     = analyzeCount     * 0.015; // Haiku, max16000tok
    const caRewriteCostUsd     = rewriteCount     * 0.003; // Haiku, max2000tok
    const caRewriteExecCostUsd = rewriteExecCount * 0.008; // Haiku, max6000tok
    const caBestCostUsd        = bestCount        * 0.01;  // Haiku, TOP10×簡潔分析 max4000tok
    estimatedUsd += caAnalyzeCostUsd + caRewriteCostUsd + caRewriteExecCostUsd + caBestCostUsd;

    const gscCount      = 0; // GSCは廃止
    const seoCheckCount = rankCheckCount;

    const estimatedJpy = Math.ceil(estimatedUsd * USD_TO_JPY);
    const totalJobs    = jobs.length;
    const doneJobs     = jobs.filter((j) => j.status === 'done').length;

    return NextResponse.json({
      success: true,
      month: `${now.getFullYear()}/${now.getMonth() + 1}`,
      columnJobs,
      caseStudyItems,
      totalJobs,
      doneJobs,
      estimatedUsd: estimatedUsd.toFixed(2),
      estimatedJpy,
      // SEO
      seoCheckCount,
      rankCheckCount,
      rankCostUsd: rankCostUsd.toFixed(2),
      gscCount,
      pdfCount,
      analyzeCount,
      rewriteCount,
      rewriteExecCount,
      bestCount,
    });
  } catch (err) {
    console.error('[API/stats GET]', err);
    return NextResponse.json({ success: false, error: '統計取得に失敗しました' }, { status: 500 });
  }
}
