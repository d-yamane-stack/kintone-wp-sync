'use strict';

/**
 * SEO順位チェック用キーワードの一括登録スクリプト。
 *
 * 【対象】
 * - estate（中古リノベ / jube-estate.com）: 成田市・柏市の2エリア
 * - funs-life-home（新築注文住宅 / funs-life-home.jp）: 成田市・旭市・鹿嶋市・神栖市・佐倉市の5エリア
 *   ※UIの店舗タブは「成田 / 旭・東総 / 鹿嶋・神栖 / 佐倉」の4グループに集約される
 *
 * キーワードは「{テーマ} {エリア}」形式。既存サイト（jube/nurube）と同じ命名規則で、
 * seo/page.js の STORE_FILTERS がエリア名の部分一致で店舗別に振り分ける。
 *
 * 【重複について】
 * seo_keywords は @@unique([siteId, keyword]) のため、再実行しても重複登録されない
 * （既存行は isActive:true に戻すだけ）。
 *
 * 【使い方】ルートディレクトリで実行:
 *   node scripts/seed-seo-keywords.js --dry-run          # 登録内容の確認のみ
 *   node scripts/seed-seo-keywords.js                    # 全対象サイトを登録
 *   node scripts/seed-seo-keywords.js estate             # 特定サイトのみ
 *   node scripts/seed-seo-keywords.js --deactivate-kaitai # 解体サイトのキーワードを無効化
 *
 * 【--deactivate-kaitai について】
 * 解体サイトをSEO順位チェックの対象外にする。削除ではなく isActive:false にするため、
 * 再開したくなれば同じレコードを戻せる。無効化しないと、UIから消えても順位取得の
 * 対象には残り続けAPIクレジットを消費する点に注意。
 */

require('dotenv').config({ override: true });

const { getPrismaClient } = require('../db/client');

// エリア名: キーワード文字列に含める地名。正式な市名（「市」付き）で登録する。
// STORE_FILTERS 側は「市」なしの地名（'成田' 等）で部分一致するため、そのまま店舗タブに振り分けられる。
const ESTATE_AREAS = ['成田市', '柏市'];
const FUNS_AREAS   = ['成田市', '旭市', '鹿嶋市', '神栖市', '佐倉市'];

// テーマ: 中古リノベ（購入・リノベーション検討層の検索意図）
const ESTATE_THEMES = [
  '中古住宅 リノベーション',
  '中古住宅 購入',
  '中古マンション リノベーション',
  'リノベーション 費用',
  '中古戸建 リフォーム',
  '空き家 リノベーション',
];

// テーマ: 新築注文住宅（土地探し〜依頼先検討層の検索意図）
const FUNS_THEMES = [
  '注文住宅',
  '新築 一戸建て',
  '工務店',
  '注文住宅 費用',
  '家づくり 相談',
  '土地探し 注文住宅',
];

function buildKeywords(themes, areas) {
  const out = [];
  themes.forEach(function (theme) {
    areas.forEach(function (area) {
      out.push(theme + ' ' + area);
    });
  });
  return out;
}

const SEED = {
  estate: buildKeywords(ESTATE_THEMES, ESTATE_AREAS),
  'funs-life-home': buildKeywords(FUNS_THEMES, FUNS_AREAS),
};

async function main() {
  const args      = process.argv.slice(2);
  const dryRun    = args.includes('--dry-run');
  const deactKait = args.includes('--deactivate-kaitai');
  const siteId    = args.find(function (a) { return !a.startsWith('--'); }) || null;

  const prisma = getPrismaClient();

  if (deactKait) {
    const target = await prisma.seoKeyword.count({ where: { siteId: 'kaitai', isActive: true } });
    console.log('解体サイトの有効キーワード: ' + target + '件' + (dryRun ? '（ドライラン: 変更しません）' : ' → 無効化します'));
    if (!dryRun && target > 0) {
      const r = await prisma.seoKeyword.updateMany({
        where: { siteId: 'kaitai', isActive: true },
        data:  { isActive: false },
      });
      console.log('  ✓ ' + r.count + '件を無効化しました（削除ではないため復元可能）');
    }
    console.log('---------------------------------------------');
  }

  const sites = siteId ? [siteId] : Object.keys(SEED);

  for (let s = 0; s < sites.length; s++) {
    const sid  = sites[s];
    const list = SEED[sid];
    if (!list) {
      console.warn('対象外のsiteId: ' + sid + '（登録可能: ' + Object.keys(SEED).join(', ') + '）');
      continue;
    }

    console.log('[' + sid + '] ' + list.length + '件' + (dryRun ? '（ドライラン: 登録しません）' : ''));

    let added = 0, restored = 0;
    for (let i = 0; i < list.length; i++) {
      const kw = list[i];
      if (dryRun) { console.log('  ・' + kw); continue; }

      const existing = await prisma.seoKeyword.findUnique({
        where: { siteId_keyword: { siteId: sid, keyword: kw } },
      });
      await prisma.seoKeyword.upsert({
        where:  { siteId_keyword: { siteId: sid, keyword: kw } },
        update: { isActive: true },
        create: { siteId: sid, keyword: kw, category: '地域', isActive: true },
      });
      if (existing) { restored++; } else { added++; console.log('  + ' + kw); }
    }

    if (!dryRun) {
      console.log('  新規 ' + added + '件 / 既存 ' + restored + '件');
    }
    console.log('---------------------------------------------');
  }

  await prisma.$disconnect().catch(function () {});
}

main().catch(function (e) { console.error(e); process.exit(1); });
