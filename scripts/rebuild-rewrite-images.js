'use strict';

/**
 * 既にリライト済みのコラムのタイトル画像を「新規作成」で作り直すワンショットスクリプト。
 *
 * 【背景】
 * 旧ロジックは既存アイキャッチ（＝旧タイトルが焼き込まれたタイトル画像）を土台に
 * 新タイトルを重ね書きしていたため、タイトルが二重表示になっていた。
 * pipelines/rewritePost.js は修正済み（今後のリライトは必ず新規画像を作成）。
 * このスクリプトは「過去にリライトした記事」に対し、修正後ロジックで画像を作り直して
 * 上書き公開する（本文の画像ブロックも新しいものに差し替わる）。
 *
 * 【重要】WP書き込みには国内IPが必要（XSERVERが海外IPをブロックする）。
 *  必ずローカルPC（worker稼働環境）で実行すること。クラウド(Vercel/Render)からは403になる。
 *
 * 【使い方】ルートディレクトリで実行:
 *   node scripts/rebuild-rewrite-images.js              # 全リライト済み記事
 *   node scripts/rebuild-rewrite-images.js jube         # 特定サイトのみ (jube/nurube/estate/kaitai)
 *   node scripts/rebuild-rewrite-images.js --dry-run    # 対象一覧の確認のみ（更新しない）
 *   node scripts/rebuild-rewrite-images.js estate --dry-run
 *
 * npm 経由:
 *   npm run rebuild:rewrite-images -- jube
 */

require('dotenv').config({ override: true });

const { getPrismaClient }        = require('../db/client');
const { runRewritePostPipeline } = require('../pipelines/rewritePost');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function main() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const siteId = args.find(function (a) { return !a.startsWith('--'); }) || null;

  const prisma = getPrismaClient();

  // 対象: 自動投稿済みリライト（rewrite_post）のみ。手動コピー用(rewrite)はWP上に対象記事が無いため除外。
  const jobs = await prisma.contentJob.findMany({
    where: {
      jobType:   'rewrite_post',
      deletedAt: null,
      ...(siteId ? { siteId: siteId } : {}),
    },
    orderBy: { startedAt: 'asc' },
    include: {
      contentItems: {
        select:  { id: true, generatedTitle: true, generatedBody: true },
        orderBy: { createdAt: 'desc' },
        take:    1,
      },
    },
  });

  console.log('対象リライト記事: ' + jobs.length + '件'
    + (siteId ? '（site=' + siteId + '）' : '')
    + (dryRun ? '   ※ドライラン（更新しません）' : ''));
  console.log('---------------------------------------------');

  let ok = 0, fail = 0, skip = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j     = jobs[i];
    const meta  = j.meta || {};
    const item  = j.contentItems[0] || null;
    const title = (item && item.generatedTitle) || meta.newTitle || '(無題)';
    const ref   = meta.wpPostId ? ('post=' + meta.wpPostId) : (meta.originalUrl || meta.url || '?');
    const label = '[' + (i + 1) + '/' + jobs.length + '] site=' + j.siteId + ' ' + ref + ' / ' + title;

    if (!item || !item.generatedBody) { console.log('skip（本文なし） ' + label); skip++; continue; }
    if (dryRun) { console.log('・' + label); continue; }

    try {
      console.log('▶ ' + label);
      const res = await runRewritePostPipeline(meta, j.id);
      console.log('  ✓ 更新完了: ' + (res.wpUrl || ('post ' + res.wpPostId)));
      ok++;
      await sleep(1500); // WP / Pexels への連続負荷を避ける
    } catch (e) {
      console.warn('  ✗ 失敗: ' + e.message);
      fail++;
    }
  }

  console.log('---------------------------------------------');
  console.log('完了: 成功 ' + ok + ' / 失敗 ' + fail + ' / スキップ ' + skip);

  await prisma.$disconnect().catch(function () {});
}

main().catch(function (e) { console.error(e); process.exit(1); });
