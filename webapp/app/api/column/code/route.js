import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 非WP（貼付コード）サイトの生成HTMLを返す。コラム画面の「コード」ボタンから遅延取得する。
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// GET /api/column/code?itemId=xxx — contentItem の生成HTML（generatedBody）を返す
export async function GET(request) {
  try {
    const itemId = new URL(request.url).searchParams.get('itemId');
    if (!itemId) {
      return NextResponse.json({ success: false, error: 'itemId は必須です' }, { status: 400 });
    }
    const item = await prisma.contentItem.findUnique({
      where:  { id: itemId },
      select: { generatedTitle: true, generatedBody: true, status: true },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: '見つかりませんでした' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      title:   item.generatedTitle || '',
      code:    item.generatedBody  || '',
      status:  item.status,
    });
  } catch (err) {
    console.error('[API/column/code]', err);
    return NextResponse.json({ success: false, error: 'コードの取得に失敗しました' }, { status: 500 });
  }
}
