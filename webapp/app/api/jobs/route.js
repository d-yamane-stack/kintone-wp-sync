import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { workerFetch } from '@/lib/workerFetch';

// Next.js App Router: GET route handler の自動キャッシュを無効化
// （Prisma で取得する DB 内容は常に最新を返したい）
export const dynamic     = 'force-dynamic';
export const revalidate  = 0;

// 中古リノベ（estate）のスタッフコラムCPT: 公開済み投稿IDを無認証GETで取得する。
// 公開記事は誰でも（=Vercelからも）取得できるため認証情報は不要。
// p-write一覧の「下書き」が、WP側で公開した後も古いままになるのを防ぐライブ反映用。
const ESTATE_COLUMNS_REST = 'https://www.jube-estate.com/wp/?rest_route=/wp/v2/columns&per_page=100&_fields=id';
let _estPubCache = { at: 0, ids: null };
async function getEstatePublishedIds() {
  const now = Date.now();
  if (_estPubCache.ids && (now - _estPubCache.at) < 20000) return _estPubCache.ids; // 20秒キャッシュ
  try {
    const res = await fetch(ESTATE_COLUMNS_REST, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'p-write/1.0' } });
    if (!res.ok) return _estPubCache.ids;
    const arr = await res.json();
    if (!Array.isArray(arr)) return _estPubCache.ids;
    const ids = new Set(arr.map(p => p.id));
    _estPubCache = { at: now, ids };
    return ids;
  } catch {
    return _estPubCache.ids; // 取得失敗時は前回値（なければnull）でフォールバック
  }
}

// GET /api/jobs — ジョブ一覧（Supabase直接）
export async function GET() {
  try {
    const jobs = await prisma.contentJob.findMany({
      where: { deletedAt: null, jobType: { notIn: ['sync_wp', 'rewrite', 'rewrite_post'] } },
      take: 50,
      orderBy: { startedAt: 'desc' },
      include: {
        site: { select: { siteName: true } },
        _count: { select: { contentItems: true } },
        contentItems: {
          select: {
            id: true,
            status: true,
            errorMessage: true,
            generatedTitle: true,
            postResult: { select: { wpPostId: true, wpEditUrl: true, postStatus: true, wpPublishedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // 中古リノベのコラム: WPで公開済みのものは postStatus を 'publish' に上書き（一覧へライブ反映）。
    // 失敗時は何もしない（DBの値のまま）ので安全。
    const hasEstateColumn = jobs.some(j => j.siteId === 'estate' && j.jobType === 'column');
    if (hasEstateColumn) {
      const pubIds = await getEstatePublishedIds();
      if (pubIds && pubIds.size) {
        for (const j of jobs) {
          if (j.siteId !== 'estate' || j.jobType !== 'column') continue;
          for (const it of j.contentItems) {
            if (it.postResult && it.postResult.wpPostId && pubIds.has(it.postResult.wpPostId)) {
              it.postResult.postStatus = 'publish';
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, jobs });
  } catch (err) {
    console.error('[API/jobs GET]', err);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}

// POST /api/jobs — ジョブ投入（Render server.js に転送）
export async function POST(request) {
  try {
    const body     = await request.json();
    const endpoint = body.type === 'column' ? '/api/jobs/column' : '/api/jobs/case-study';
    const res      = await workerFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const data     = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (err) {
    console.error('[API/jobs POST]', err);
    return NextResponse.json({ success: false, error: 'ジョブ投入に失敗しました' }, { status: 500 });
  }
}
