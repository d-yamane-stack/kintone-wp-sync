import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Claude Sonnet 4.5 料金（概算）
const COST_PER_JOB = {
  column:     0.07,  // 入力5k + 出力3k tokens ≒ $0.07
  case_study: 0.04,  // 入力3k + 出力2k tokens ≒ $0.04/件
};
const USD_TO_JPY = 150;

export async function GET() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const jobs = await prisma.contentJob.findMany({
      where: { startedAt: { gte: monthStart } },
      select: { jobType: true, status: true, _count: { select: { contentItems: true } } },
    });

    const columnJobs      = jobs.filter((j) => j.jobType === 'column').length;
    const caseStudyItems  = jobs
      .filter((j) => j.jobType === 'case_study')
      .reduce((s, j) => s + j._count.contentItems, 0);
    const totalJobs       = jobs.length;
    const doneJobs        = jobs.filter((j) => j.status === 'done').length;

    const estimatedUsd = columnJobs * COST_PER_JOB.column
                       + caseStudyItems * COST_PER_JOB.case_study;
    const estimatedJpy = Math.ceil(estimatedUsd * USD_TO_JPY);

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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
