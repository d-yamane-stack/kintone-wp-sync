import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// DELETE /api/jobs/[id] — ソフトデリート（deletedAt をセット）
// ※ 物理削除しないことでコスト集計に影響させない
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.contentJob.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API/jobs/[id] DELETE]', err);
    return NextResponse.json({ success: false, error: '削除に失敗しました' }, { status: 500 });
  }
}
