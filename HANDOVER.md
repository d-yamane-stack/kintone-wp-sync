# RE-WRITE システム 引継ぎ資料

最終更新: 2026-05-06

---

## 1. システム全体概要

WordPress コンテンツの自動生成・投稿 ＋ SEO順位/競合調査 を行う社内ツール。

| コンポーネント | 場所 | 役割 |
|---|---|---|
| **webapp** (Next.js 15) | Render（クラウド） | 管理画面UI・API |
| **worker.js** | ローカルPC（常時起動必要） | ジョブキューの処理（Claude API呼び出し・WordPress投稿など） |
| **DB** | Supabase（PostgreSQL） | 全データ保存 |
| **Redis** | Upstash | BullMQジョブキュー |

**重要**: worker.js はローカルPCで `npm run worker` で起動。これが止まるとコラム生成・施工事例取込が動かない。  
webapp は Render に常駐しているため、スマホ・他PCからもアクセス可能。ただし無料プランのため **初回アクセスに50秒ほどかかる場合あり**（スピンダウン復帰）。

---

## 2. URL・アクセス情報

| 項目 | 値 |
|---|---|
| webapp URL | https://kintone-wp-sync.onrender.com |
| GitHub リポジトリ | https://github.com/d-yamane-stack/kintone-wp-sync |
| Render ダッシュボード | https://dashboard.render.com |
| Supabase | https://app.supabase.com |

**デプロイ**: `git push origin main` → Render が自動デプロイ（数分）

---

## 3. 対象サイト

| siteId | サイト名 | ドメイン |
|---|---|---|
| `jube` | 重兵衛 | jube.co.jp |
| `nurube` | ぬりべえ | nuribe.jp |

---

## 4. 主要機能

### 4-1. コラム自動生成
- キーワード・ターゲット・トーン等を指定 → Claude API でコラム生成 → WordPress 下書き投稿
- 使用モデル: Claude Sonnet 系（PromptTemplate で管理）
- コスト目安: 1件 ≈ ¥2（$0.01 × ¥150）

### 4-2. 施工事例取込
- kintone から施工事例データ取得 → Claude API で文章整形 → WordPress 投稿
- コスト目安: 1件 ≈ ¥6（$0.04 × ¥150）

### 4-3. SEO順位/競合調査（主な開発対象）
- **キーワード登録**: サイトごとに追跡するキーワードを登録
- **順位取得**: Serper.dev API（無料枠: 月2,500リクエスト）で上位20位まで取得
- **競合比較**: 競合ドメインを登録し、自社vs競合の順位を並べて表示
- **PDFレポート**: Claude Haiku 4.5 でAI考察付きのA4×2枚レポート生成
- **自動取得スケジュール**: 毎月1日・15日 09:00（worker.js の node-cron）

---

## 5. SEO画面の仕様詳細

### KPIカード（4種）

| カード | 内容 |
|---|---|
| **Top10率** | 登録KW中、自社が10位以内に入っている割合 |
| **前回比変動** | 前回比で上昇/下降したKW数 |
| **期待流入数** | 月間100検索 × 順位別CTRの合計（参考値）※ⓘボタンで詳細表示 |
| **競合勝敗** | 最強競合より自社順位が上のKW数 vs 下のKW数 |

### 期待流入数の計算式
```
期待流入数 = 月間検索数(仮: 100) × 順位別CTR
```

| 順位 | CTR | 順位 | CTR |
|---|---|---|---|
| 1位 | 31.7% | 6位 | 6.7% |
| 2位 | 24.7% | 7位 | 5.0% |
| 3位 | 18.7% | 8位 | 4.0% |
| 4位 | 13.6% | 9位 | 3.2% |
| 5位 | 9.5% | 10位 | 2.5% |
| 11〜20位 | 0.4% | 圏外（21位以下） | 0% |

> **注意**: 現在は月間100検索を仮定した参考値。DataForSEO連携後に実ボリュームへ切替予定。

### キーワードリスト仕様
- デフォルト: 小窓表示（高さ固定）
- 「全表示▲」ボタンで展開
- 「✓ 選択」ボタンで複数選択 → 一括削除
- 流入▼ ボタンで期待流入数の多い順にソート
- ※圏外 = 21位以下（Serper API は `num: 20` で取得）

### PCレイアウト
- 左右2カラム（キーワード一覧 / SERP・グラフパネル）
- 両パネルとも **高さ660px固定**（タブ切替でサイズ変わらない）

---

## 6. ファイル構成（重要ファイルのみ）

```
kintone-wp-sync/
├── worker.js                          # ローカル常駐ワーカー（npm run worker）
├── db/
│   └── schema.prisma                  # DBスキーマ（変更後は npm run db:push）
├── pipelines/
│   ├── seoRank.js                     # 順位取得ロジック（Serper API呼び出し）
│   ├── column.js                      # コラム生成
│   ├── caseStudy.js                   # 施工事例取込
│   └── syncWp.js                      # WordPress投稿
├── webapp/
│   ├── app/
│   │   ├── layout.js                  # 共通レイアウト・認証チェック
│   │   ├── HeaderStats.js             # ヘッダーのAPI費用表示コンポーネント
│   │   ├── login/page.js              # ログインページ
│   │   ├── seo/page.js                # SEO順位/競合調査メイン画面
│   │   └── api/
│   │       ├── stats/route.js         # 月次コスト集計API
│   │       └── seo/
│   │           ├── keywords/route.js  # キーワードCRUD
│   │           ├── check/route.js     # 順位取得トリガー
│   │           ├── pdf/route.js       # PDFレポート生成（Haiku 4.5）
│   │           ├── csv/route.js       # CSVエクスポート
│   │           ├── history/[keywordId]/route.js  # 順位履歴
│   │           ├── serp/[keywordId]/route.js     # SERP Top10
│   │           ├── competitors/route.js           # 競合管理
│   │           ├── config/route.js                # アラート設定
│   │           └── logs/route.js                  # 取得ログ
│   └── package.json                   # webapp 依存パッケージ
└── scripts/
    └── set-volumes.mjs                # 検索ボリューム一括登録スクリプト（未使用）
```

---

## 7. DBスキーマ（SEO関連）

```prisma
model SeoKeyword {
  id           String   @id
  siteId       String                  // "jube" | "nurube"
  keyword      String                  // キーワード（地域名付き例: "お風呂リフォーム 成田"）
  category     String?
  isPriority   Boolean  @default(false)
  searchVolume Int?                    // 月間検索ボリューム（DataForSEO連携後に使用予定）
  isActive     Boolean  @default(true) // false = ソフトデリート
  createdAt    DateTime @default(now())
}

model SeoRankRecord {
  keywordId String
  checkedAt DateTime
  domain    String   // ドメイン（自社・競合）
  isOwn     Boolean  // 自社フラグ
  position  Float?   // null = 圏外（21位以下）
}

model SeoFetchLog {
  siteId    String   // 通常: "jube"等、PDF: "pdf_jube"等
  startedAt DateTime
  status    String   // "running" | "success" | "error"
  count     Int?     // 取得件数（PDFは1固定）
}
```

> **SeoFetchLog の二重利用**: `siteId` が `"pdf_"` で始まるレコードはPDF生成ログとして流用。月次コスト計算に使用。

---

## 8. 外部サービス・APIキー

| サービス | 用途 | 費用 | 備考 |
|---|---|---|---|
| **Anthropic (Claude API)** | コラム生成・施工事例・PDFレポート | 従量課金 | コラム¥2/件、施工事例¥6/件、PDF¥0.75/件 |
| **Serper.dev** | SEO順位取得 | 月2,500件まで無料 | 80%超えで警告表示 |
| **Supabase** | PostgreSQL DB | 無料枠内 | |
| **Render** | webapp ホスティング | 無料枠（スピンダウンあり） | |
| **Upstash** | Redis（ジョブキュー） | 無料枠内 | |
| **kintone** | 施工事例データソース | 契約済み | |
| **WordPress** | 投稿先CMS | 契約済み | |

---

## 9. 使用モデル

| 用途 | モデル | 備考 |
|---|---|---|
| コラム生成 | `claude-haiku-4-5` | Sonnetから変更済み |
| PDFレポートAI考察 | `claude-haiku-4-5-20251001` | コスト削減のためHaiku |

---

## 10. 今後の予定（未実装）

### DataForSEO連携（検索ボリューム自動取得）
- **タイミング**: Serper.dev 無料枠が枯渇したタイミングで移行
- **対象**: キーワード追加時のみボリューム自動取得
- **DB**: `SeoKeyword.searchVolume` フィールドは既に追加済み
- **API**: `PATCH /api/seo/keywords` も `searchVolume` 更新に対応済み
- **期待流入数の計算**: `searchVolume × rankCTR(position)` に切替（`seo/page.js` の `kwExpected` 関数を修正）

### PDFレポート改善
- 競合サイトの追加分析
- 月次比較グラフ

---

## 11. 開発メモ・注意事項

### Next.js 15 の async params
```js
// NG（paramsはPromise）
const { keywordId } = params;

// OK
const { keywordId } = await params;
```
`await` を忘れると Prisma の WHERE が無視され全件取得になるバグが発生する。

### DBスキーマ変更手順
```bash
# スキーマ編集後
npm run db:push   # Supabase に即時反映（ルートディレクトリで実行）
```

### Renderのスピンダウン対策
- 無料プランは15分アクセスがないとスピンダウン
- 初回アクセスで50秒ほど待つ必要あり
- ログイン後は `window.location.href = '/'` でフルリロード（`router.replace` だとキャッシュ問題が起きるため）

### CSS注意点
- `overflow-y: visible` を設定すると CSS 仕様により `overflow-x: auto` が強制され、グリッドアイテムが横に広がるバグが発生
- グリッドアイテムは `min-width: 0` を設定しないと自動縮小しない

---

## 12. ローカル起動手順

```bash
# ルートディレクトリ（ワーカー起動）
npm run worker

# webapp ディレクトリ（ローカル確認時のみ）
cd webapp
npm run dev     # http://localhost:3000
```

**環境変数**: ルートの `.env` に設定（DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY, SERPER_API_KEY 等）
