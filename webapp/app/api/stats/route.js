import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const USD_TO_JPY = 150;
// Serper.dev 無料枠（月2,500リクエスト）
const SERPER_FREE_LIMIT = 2500;

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // コンテンツジョブ集計（deletedAt フィルタなし → ソフトデリート済みも含める）
    const jobs = await prisma.contentJob.findMany({
      where: { startedAt: { gte: monthStart } },
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
    const seoLogs = await prisma.seoFetchLog.findMany({
      where:  { startedAt: { gte: monthStart }, status: 'success' },
      select: { siteId: true, count: true },
    });
    const serperCount   = seoLogs.filter(l => !l.siteId.startsWith('pdf_')).reduce((s, l) => s + (l.count || 0), 0);

    // PDF生成集計（当月）
    const pdfCount    = seoLogs.filter(l => l.siteId.startsWith('pdf_')).reduce((s, l) => s + (l.count || 0), 0);
    const pdfCostUsd  = pdfCount * 0.005; // Haiku 4.5: 入力800tok+出力1000tok ≈ $0.005/回
    estimatedUsd += pdfCostUsd;
    const gscCount      = 0; // GSCは廃止
    const seoCheckCount = serperCount;

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
      serperCount,
      gscCount,
      serperFreeLimit: SERPER_FREE_LIMIT,
      pdfCount,
    });
  } catch (err) {
    console.error('[API/stats GET]', err);
    return NextResponse.json({ success: false, error: '統計取得に失敗しました' }, { status: 500 });
  }
}
