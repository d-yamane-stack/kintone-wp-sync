# kintone-wp-sync 仕様書

## プロジェクト概要

Kintone に蓄積された施工事例データを Claude AI で推敲・拡張し、WordPress に自動投稿するシステム。
加えてキーワード指定でコラム記事を AI 生成し WP に下書き投稿する機能も持つ。

非エンジニアが操作できる Next.js 製 Web アプリ（`webapp/`）から操作できる。

---

## アーキテクチャ全体図

```
[Kintone]
    ↓ 施工事例レコード取得
[sources/kintone.js]
    ↓
[pipelines/caseStudy.js]  ←→  [pipelines/column.js] ← キーワード入力
    ↓                               ↓
[jobs/processBatch.js]    [ai/prompts/column_jube.js]
    ↓                               ↓
[ai/claudeClient.js]      Claude API (claude-sonnet-4-5)
    ↓                               ↓
[publishers/wordpress.js] ← WP REST API 投稿
    ↓
[db/repositories/*]  → Supabase (PostgreSQL via Prisma)

キューシステム:
[webapp (Next.js)] → POST /api/jobs → [server.js] → BullMQ (Upstash Redis) → [worker.js] → pipelines/*
```

---

## ディレクトリ構成

```
kintone-wp-sync/
├── server.js              # HTTPサーバー（ジョブ投入API, port 3000）
├── worker.js              # BullMQワーカー（ジョブ処理）
├── index.js               # CLIエントリーポイント
├── start.bat              # 全プロセス一括起動（ダブルクリックで起動）
├── .env                   # 環境変数（gitignore対象）
│
├── ai/
│   ├── claudeClient.js    # Claude API呼び出し（施工事例テキスト拡張）
│   └── prompts/
│       ├── column_jube.js # コラム生成プロンプト（jube専用、JSON返却）
│       └── reform.js      # 施工事例拡張プロンプト
│
├── config/index.js        # Kintone・Anthropic設定、各種マッピング定数
│
├── db/
│   ├── client.js          # Prismaシングルトン
│   ├── schema.prisma      # DBスキーマ定義
│   └── repositories/
│       ├── jobRepo.js         # ContentJob CRUD
│       ├── contentItemRepo.js # ContentItem CRUD（pending→generated→posted）
│       └── postResultRepo.js  # PostResult CRUD
│
├── jobs/
│   ├── processBatch.js    # レコード配列のバッチ処理（existingJobId対応）
│   └── processRecord.js   # 1レコード処理（画像DL→Claude→WP投稿→DB記録）
│
├── pipelines/
│   ├── caseStudy.js       # 施工事例パイプライン（Kintone取得→processBatch）
│   └── column.js          # コラム生成パイプライン（Claude生成→WP投稿→DB記録）
│
├── publishers/wordpress.js # WP REST API（画像UP・記事投稿・ACFパッチ）
├── queue/
│   ├── connection.js      # Redis接続（Upstash）
│   └── index.js           # BullMQキューシングルトン
│
├── sites/siteConfigs.js   # マルチサイト設定（getSiteConfig() がadminBaseを計算）
├── sources/kintone.js     # Kintone API（レコード取得・ファイルDL）
├── transformers/extractRecord.js # Kintoneレコード解析・マッピング
├── lib/http.js            # HTTPリクエストユーティリティ
├── media/imageProcessor.js # 画像リサイズ（sharp）
│
└── webapp/                # Next.js Webアプリ（非エンジニア向けUI）
    ├── app/
    │   ├── layout.js          # ルートレイアウト（2段ヘッダー）
    │   ├── page.js            # ジョブ一覧（削除・再実行ボタン）
    │   ├── column/page.js     # コラム生成フォーム（複数キーワード一括）
    │   ├── case-study/page.js # 施工事例取込フォーム
    │   ├── HeaderStats.js     # ヘッダー右上コスト表示（クリックで内訳）
    │   ├── globals.css        # ダークテーマCSS変数定義
    │   └── api/
    │       ├── jobs/route.js           # GET（一覧）/ POST（投入→server.jsへ転送）
    │       ├── jobs/[id]/route.js      # DELETE（ジョブ削除）
    │       ├── jobs/[id]/retry/route.js # POST（再実行）
    │       ├── sites/route.js          # GET（サイト一覧→server.jsへ転送）
    │       └── stats/route.js          # GET（月次集計・概算コスト）
    ├── lib/db.js              # Prismaシングルトン（Next.js用）
    └── prisma/schema.prisma   # schema.prismaのコピー
```

---

## データベーススキーマ（Supabase PostgreSQL）

```prisma
model Site {
  siteId        String   @unique  // "jube" 等
  siteName      String
  wpBaseUrl     String
  wpUsername    String
  wpAppPassword String
  wpPostType    String   @default("post")
  contentJobs   ContentJob[]
}

model ContentJob {
  id           String    @id @default(uuid())
  siteId       String
  jobType      String    // "case_study" | "column"
  status       String    @default("running")  // running | done | error
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  errorMessage String?
  meta         Json?     // { keyword, audience, tone, cta } or { limit }
  contentItems ContentItem[]
}

model ContentItem {
  id             String   @id @default(uuid())
  jobId          String
  sourceType     String   // "kintone" | "manual"
  sourceRecordId String?
  rawInput       Json
  generatedTitle String?
  generatedBody  String?
  generatedMeta  Json?
  status         String   @default("pending")  // pending | generated | posted | error
  postResult     PostResult?
}

model PostResult {
  id            String @id @default(uuid())
  contentItemId String @unique
  wpPostId      Int
  wpUrl         String
  wpEditUrl     String
  postStatus    String  // "draft" | "publish"
}
```

---

## 環境変数（.env）

```bash
# Kintone
KINTONE_SUBDOMAIN=xxxxx
KINTONE_APP_ID=xxxxx
KINTONE_API_TOKEN=xxxxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Supabase
DATABASE_URL=postgresql://...（接続プール用）
DIRECT_URL=postgresql://...（マイグレーション用）

# Upstash Redis
REDIS_URL=rediss://xxxxx

# WordPress（ハウジング重兵衛）
JUBE_WP_BASE_URL=https://jube.co.jp
JUBE_WP_ADMIN_BASE_URL=https://jube.co.jp/refresh2022   # ← カスタムadminURL
JUBE_WP_USERNAME=xxxxx
JUBE_WP_APP_PASSWORD=xxxxx

# サーバー設定
PORT=3000
WORKER_CONCURRENCY=2
WORKER_API_URL=http://localhost:3000   # webappからserver.jsへの転送先

# webapp/.env.local にも同内容が必要
```

---

## 起動方法

### 開発時（全プロセス一括）
```
start.bat をダブルクリック
```
3つのターミナルが開く：
- `node server.js`（port 3000）
- `node worker.js`
- `cd webapp && npm run dev`（port 3001前後）

### 個別起動
```bash
# ターミナル1
node server.js

# ターミナル2
node worker.js

# ターミナル3
cd webapp && npm run dev
```

---

## ジョブ処理フロー詳細

### 施工事例取込

```
1. webapp: POST /api/jobs { type: "case_study", siteId, limit }
2. webapp/api/jobs: server.js の POST /api/jobs/case-study へ転送
3. server.js:
   - DB: ContentJob を "running" で INSERT（dbJobId 発行）
   - BullMQ に { type, siteId, limit, dbJobId } をエンキュー
4. worker.js:
   - runCaseStudyPipeline(options, siteConfig, dbJobId) を呼び出し
5. pipelines/caseStudy.js:
   - Kintone から limit 件取得
   - processBatch(records, siteConfig, { existingJobId: dbJobId }) を呼び出し
6. jobs/processBatch.js:
   - existingJobId がある場合は createJob をスキップ
   - 各レコードを processRecord() で処理
7. jobs/processRecord.js（1レコードごと）:
   - ContentItem を "pending" で INSERT
   - 画像DL → リサイズ → WP画像UP
   - Claude API でテキスト拡張
   - ContentItem を "generated" に UPDATE
   - WP に下書き投稿（createWordPressDraft）
   - ContentItem を "posted" に UPDATE
   - PostResult を INSERT（wpEditUrl含む）
8. worker.js: finishJob(dbJobId, "done")
```

### コラム生成

```
1. webapp: POST /api/jobs { type: "column", siteId, keyword, audience, tone, cta }
2. server.js: ContentJob INSERT → BullMQ エンキュー
3. worker.js: runColumnPipeline(params, siteConfig, dbJobId)
4. pipelines/column.js:
   - ContentItem を "pending" で INSERT
   - Claude API でコラム生成（JSON形式で返却）
   - ContentItem を "generated" に UPDATE
   - buildHtmlContent() で Gutenberg ブロック形式に変換
   - WP に下書き投稿（postType: "column" ← カスタム投稿タイプ）
   - ContentItem を "posted" に UPDATE
   - PostResult を INSERT
   - Google Sheets に記録（credentials.json なければスキップ）
```

---

## WordPress 投稿仕様

### 施工事例（jube）
- エンドポイント: `/wp-json/wp/v2/example`（カスタム投稿タイプ）
- ACFフィールド: nayami, point, koe, hiyou, kikan, area, shubetu, tiku, maker, shohin, menseki, tanto_message, tanto_free, tenpo
- 画像: ACF Repeaterフィールド（after-main / before-main）
- 管理画面URL: `JUBE_WP_ADMIN_BASE_URL/wp-admin/post.php?post={id}&action=edit`

### コラム（jube）
- エンドポイント: `/wp-json/wp/v2/column`（カスタム投稿タイプ、rest_base: "column"）
- Gutenbergブロック形式:
  - `<!-- wp:paragraph -->` 導入文
  - `<!-- wp:html -->` 音声吹き出し（Liquid Speech Balloon プラグイン）
  - `<!-- wp:shortcode -->[toc]<!-- /wp:shortcode -->` 目次
  - `<!-- wp:heading {"className":"is-style-heading"} -->` H2（クラス名は `is-style-heading` のみ、`wp-block-heading` は付けない）
  - `<!-- wp:list {"className":"is-style-ul-style1"} -->` リスト（`wp-block-list` は付けない）

---

## マルチサイト対応

`sites/siteConfigs.js` に `SITE_CONFIGS` オブジェクトで各サイトを定義。
`getSiteConfig(siteId)` が `adminBase`, `restBase` を計算して返す。

```js
// adminBase の計算
const adminBase = (wp.adminBaseUrl || cleanBase).replace(/\/$/, '');
siteConfig.wordpress.adminBase = adminBase + '/wp-admin/';
```

現在定義済みサイト: `jube`（ハウジング重兵衛）, `another_site`（サンプル）

---

## Web アプリ UI 仕様

### デザイン
- ダークテーマ固定（ライトモードなし）
- CSS変数による色管理（`globals.css`）
- 深さの原則: `--bg-base`（最暗）< `--bg-input` < `--bg-card`（最明）

### ページ構成
| ページ | URL | 機能 |
|--------|-----|------|
| ジョブ一覧 | / | 最新50件表示、✕削除、再実行ボタン |
| コラム生成 | /column | 複数キーワード一括登録（1行1キーワード） |
| 施工事例取込 | /case-study | 件数選択（1/3/5/10件）して取込 |

### ヘッダー
- 上段: ロゴ + 今月概算コストボタン（クリックで内訳ポップアップ）
- 下段: ナビゲーションリンク
- コスト内訳: Claude API（コラム件数×¥10.5 + 施工事例件数×¥6）+ 他サービス無料枠表示

---

## 既知の制限・注意事項

1. **Google Sheets 記録**: `credentials.json` が未設定の場合はスキップ（エラーにはならない）
2. **コスト概算**: 平均トークン数からの試算。実際の請求は console.anthropic.com で確認
3. **Upstash Redis**: 無料枠（1日1万コマンド）。超過すると有料
4. **Supabase**: 無料枠（500MB、5万行）。現状は余裕あり
5. **Claude モデル**: `claude-sonnet-4-5` を使用中。`config/index.js` と `pipelines/column.js` で指定

---

## 今後の課題（未実装）

- コラム記事への画像挿入
- 画像自動生成
- タグ自動付与
- Google Sheets 認証情報のセットアップ
