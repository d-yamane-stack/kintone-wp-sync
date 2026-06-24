// 検索ボリューム一括登録スクリプト
// 使い方: node scripts/set-volumes.mjs
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config();

const prisma = new PrismaClient();

const VOLUMES = [
  ['リフォーム ローン',      14800],
  ['リフォーム 補助金',      22200],
  ['リフォーム 相場',         3600],
  ['キッチンリフォーム',     27100],
  ['トイレリフォーム',       40500],
  ['壁紙リフォーム',          2900],
  ['リノベーション',         49500],
  ['玄関リフォーム',          4400],
  ['増築',                    5400],
  ['浴室リフォーム',          6600],
  ['洗面所リフォーム',        8100],
  ['ユニットバスリフォーム',  5400],
  ['バスリフォーム',           590],
  ['リフォーム LDK',            50],
  ['お風呂リフォーム',       18100],
  ['玄関ドア リフォーム',    14800],
  ['壁紙 リフォーム',         2900],
  ['内装 リフォーム',         2900],
  ['平屋',                   33100],
  ['工務店',                 60500],
  ['新築 一戸建て',          27100],
  ['戸建',                   18100],
  ['一戸建て',               14800],
  ['二世帯住宅',             14800],
  ['新築',                   18100],
  ['二世帯住宅 間取り',       9900],
  ['平屋 新築',               6600],
  ['平屋 ローコスト',         5400],
  ['注文住宅 流れ',           1000],
  ['犬と暮らす 家',           1000],
  ['注文住宅',               33100],
  ['規格住宅',                2400],
  ['自由設計',                 480],
  ['雨漏り',                  8100],
  ['屋根塗装',                8100],
  ['外壁塗装',               49500],
  ['塗装',                   33100],
  ['外壁塗り替え',             720],
  ['外壁リフォーム',          6600],
  ['外壁工事',                2900],
  ['外壁修理',                1900],
  ['雨漏り修理',              9900],
  ['外壁塗装 助成金',        14800],
  ['ローコスト住宅',         12100],
  ['家づくり',                3800],
  ['外装工事',                1600],
];

async function main() {
  let updated = 0, notFound = 0;

  for (const [keyword, searchVolume] of VOLUMES) {
    const rows = await prisma.seoKeyword.updateMany({
      where: { keyword, isActive: true },
      data:  { searchVolume },
    });
    if (rows.count > 0) {
      console.log(`✓ ${keyword} → ${searchVolume.toLocaleString()}`);
      updated += rows.count;
    } else {
      console.log(`— ${keyword} (DB未登録)`);
      notFound++;
    }
  }

  console.log(`\n完了: ${updated}件更新, ${notFound}件未登録`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
