import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const USD_TO_JPY = 150;

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // deletedAt フィルタなし → ソフトデリート済みジョブも集計に含める
    const jobs = await prisma.contentJob.findMany({
      where: { startedAt: { gte: monthStart } },
      select: { jobType: true, status: true, meta: true, _count: { select: { contentItems: true } } },
    });

    // meta.costUsd が記録されていればそれを合計、なければ件数×単価で推計
    let estimatedUsd = 0;
    let columnJobs = 0;
    let caseStudyItems = 0;

    jobs.forEach((j) => {
      const metaCost = j.meta?.costUsd;
      if (typeof metaCost === 'number') {
        estimatedUsd += metaCost;
        if (j.jobType === 'column') columnJobs++;
        if (j.jobType === 'case_study') caseStudyItems += j._count.contentItems;
      } else {
        // 旧レコード（costUsd未記録）は件数で推計
        if (j.jobType === 'column') { columnJobs++; estimatedUsd += 0.07; }
        if (j.jobType === 'case_study') {
          caseStudyItems += j._count.contentItems;
          estimatedUsd += 0.04 * j._count.contentItems;
        }
      }
    });

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
    });
  } catch (err) {
    console.error('[API/stats GET]', err);
    return NextResponse.json({ success: false, error: '統計取得に失敗しました' }, { status: 500 });
  }
}
