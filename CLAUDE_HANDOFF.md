# Claude Code 引き継ぎ資料

> 最終更新: 2026-04-27  
> GitHub: https://github.com/d-yamane-stack/kintone-wp-sync

---

## システム概要

**Kintoneの施工事例データをClaude AIで加工し、WordPressへ自動投稿するシステム。**  
非エンジニアが使えるWebダッシュボード（Next.js）付き。

対応サイト：
- **jube**（ハウジング重兵衛）: 施工事例 + コラム
- **nurube**（塗装屋ぬりべえ）: 施工事例 + コラム

---

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                        ユーザー操作                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ ブラウザ / スマホ
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Vercel（webapp / Next.js）                          │
│         https://kintone-wp-sync.vercel.app                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ダッシュボード │  │ 施工事例取込 │  │   コラム生成         │  │
│  │  (page.js)   │  │(case-study/) │  │   (column/)          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                       │              │
│         └─────────────────┴───────────────────────┘              │
│                           │                                      │
│              ┌────────────┴────────────┐                        │
│              │     Next.js API Routes  │                        │
│              │  /api/jobs              │─── Supabase DB（直接）  │
│              │  /api/jobs/sync-wp  ────┼──► Render server.js    │
│              │  /api/kintone/records   │─── Render server.js    │
│              └─────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP（WORKER_API_URL）
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Render（server.js / Node.js）                       │
│         https://kintone-wp-sync-XXXX.onrender.com               │
│                                                                  │
│  POST /api/jobs/case-study  ──► BullMQキューに登録              │
│  POST /api/jobs/column      ──► BullMQキューに登録              │
│  POST /api/jobs/sync-wp     ──► BullMQキューに登録              │
│  GET  /api/jobs             ──► DB参照                          │
│  GET  /api/health                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ enqueue / dequeue
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Upstash Redis（BullMQジョブキュー）                 │
│         noted-aardvark-92027.upstash.io                         │
│         ※無料枠: 50万コマンド（使い切ったらDB再作成）           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ ジョブ取得
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              ローカルPC（worker.js）★常時起動が必要             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ジョブタイプ別処理                                        │   │
│  │                                                           │   │
│  │  case_study ─► Kintone取得 ─► Claude加工 ─► WP投稿      │   │
│  │  column     ─► Claude執筆 ─► 画像生成   ─► WP投稿       │   │
│  │  sync_wp    ─► WP API確認 ─► DB更新                     │   │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                    │
│  ※ローカルIPからWP APIを叩く（XSERVERの海外IPブロック回避）     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│  Kintone     │  │  Claude API  │  │  WordPress REST API       │
│  API         │  │  (Anthropic) │  │  jube.co.jp              │
│  施工事例DB  │  │  Sonnet/Haiku│  │  nuribe.jp               │
└──────────────┘  └──────────────┘  └──────────────────────────┘
                                              │
                           ┌──────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase（PostgreSQL）                              │
│         aws-1-ap-northeast-1.pooler.supabase.com                │
│                                                                  │
│  Site / ContentJob / ContentItem / PostResult                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## デプロイ先一覧

| サービス | URL / 場所 | 用途 |
|---------|-----------|------|
| **Vercel** | https://kintone-wp-sync.vercel.app | Webダッシュボード |
| **Render** | https://kintone-wp-sync-XXXX.onrender.com | APIサーバー（server.js） |
| **Supabase** | プロジェクト: fvtlycwbydtohnhibxqe | PostgreSQL DB |
| **Upstash** | noted-aardvark-92027.upstash.io | Redis（BullMQキュー） |
| **ローカルPC** | デスクトップショートカット | worker.js（常時起動） |

---

## ローカルworker.jsの起動・停止

デスクトップにショートカットあり：

| ショートカット | 動作 |
|--------------|------|
| `worker起動` | `node worker.js` を実行 |
| `worker停止` | worker.jsプロセスを終了 |

手動起動する場合：
```powershell
cd "C:\Users\yamane daichi\Desktop\kintone-wp-sync"
node worker.js
```

⚠️ **worker.jsはPC起動時に自動起動しない。使う前に必ず起動すること。**  
⚠️ **Redisコマンド節約のため、使わないときは停止しておくこと。**

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16 App Router + React 19 + Tailwind CSS v4 |
| APIサーバー | Node.js（CommonJS、Expressなし）|
| ジョブキュー | BullMQ + Upstash Redis |
| データベース | Prisma v5 + Supabase (PostgreSQL) |
| AI | Anthropic Claude API（Sonnet / Haiku）|
| WordPress | REST API + ACFプラグイン |

---

## 実装済み機能

### 施工事例取込（jube）
- Kintone App 207 → WP `example` 投稿
- Claude Sonnet でテキスト拡張（お悩み・ポイント・担当者コメント）
- 画像アップロード（before/during/after 各グループ → ACF Repeater）
- タクソノミー自動付与（施工箇所・エリア・ショールーム）
- 担当者マッチング（Kintone作成者名 ↔ WPユーザー）

### 施工事例取込（nurube）
- Kintone App 513 → WP `properties` 投稿
- Claude Haiku でタイトル生成
- ACF Repeater: after/under/before 各写真グループ
- ACF 材料リスト: `buzai-wrap`（`mekar2` + `name2`）
- 担当者マッチング

### コラム生成（jube / nurube 共通）
- キーワード → 全自動執筆・WP予約投稿
- タイトル画像自動生成（Pexels API）
- AIOSEOメタフィールド書き込み
- キーワードAIリコメンド機能（季節・サイト特性考慮）

### ダッシュボード
- ジョブ一覧（フィルタ・サイト別・種別別）
- WP同期ボタン（worker.js経由でWP APIを確認、DBに反映）
- コスト集計表示
- ジョブ削除（ソフトデリート）
- **スマホ対応（ボトムナビゲーション）**

---

## 重要ファイル一覧

```
kintone-wp-sync/
├── .env                           # 環境変数（gitignore対象）
├── server.js                      # APIサーバー → Renderで動作
├── worker.js                      # BullMQワーカー → ローカルで動作
├── start.bat                      # ローカル全起動スクリプト
├── stop-worker.bat                # worker.js停止スクリプト
├── sites/siteConfigs.js           # ★マルチサイト設定の中心
├── sources/kintone.js             # Kintone API
├── transformers/
│   ├── extractRecord.js           # jube レコード抽出
│   └── extractNurubeRecord.js     # nurube レコード抽出
├── pipelines/
│   ├── caseStudy.js               # 施工事例パイプライン
│   ├── column.js                  # コラム生成パイプライン
│   └── syncWp.js                  # ★WP同期（ローカルIP必須）
├── publishers/wordpress.js        # WP REST API 投稿
├── media/generateColumnImage.js   # コラムタイトル画像生成
├── db/
│   ├── schema.prisma              # DBスキーマ
│   └── repositories/jobRepo.js   # ジョブCRUD
└── webapp/
    ├── app/layout.js              # レイアウト（レスポンシブ対応済み）
    ├── app/Sidebar.js             # PCサイドバー
    ├── app/BottomNav.js           # スマホボトムナビ
    ├── app/TopBar.js              # トップバー
    ├── app/page.js                # ダッシュボード
    ├── app/case-study/page.js     # 施工事例取込
    ├── app/column/page.js         # コラム生成
    └── app/api/
        ├── jobs/route.js          # ジョブ一覧（DB直接）
        ├── jobs/sync-wp/route.js  # WP同期（Render経由）
        └── jobs/[id]/route.js     # ジョブ削除
```

---

## 環境変数

### ローカル（`.env`）・Render・Vercel 共通で必要な変数

```env
# Kintone（jube）
KINTONE_SUBDOMAIN=housing-jube
KINTONE_APP_ID=207
KINTONE_API_TOKEN=...

# Kintone（nurube）
NURUBE_KINTONE_APP_ID=513
NURUBE_KINTONE_API_TOKEN=...

# Claude API
ANTHROPIC_API_KEY=...

# WordPress（jube）
WP_BASE_URL=https://jube.co.jp
WP_USERNAME=adjube
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
JUBE_WP_ADMIN_BASE_URL=https://jube.co.jp/refresh2022

# WordPress（nurube）
NURUBE_WP_BASE_URL=https://nuribe.jp        ← /wp-json のベース（管理画面URLではない）
NURUBE_WP_ADMIN_BASE_URL=https://nuribe.jp/refresh2023
NURUBE_WP_USERNAME=nuribeadmin
NURUBE_WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# Supabase（PostgreSQL）
DATABASE_URL=postgresql://...?pgbouncer=true
DIRECT_URL=postgresql://...

# Upstash Redis
REDIS_URL=rediss://default:...@noted-aardvark-92027.upstash.io:6379

# Pexels（コラム画像）
PEXELS_API_KEY=...

# Vercel専用（webappからRenderを呼ぶ用）
WORKER_API_URL=https://kintone-wp-sync-XXXX.onrender.com
```

---

## WP同期の仕組み（重要）

XSERVERは**海外IPからのREST APIアクセスをブロック**する。  
Vercel（米国）やRender（米国）から直接WPを叩くと **HTTP 403** になる。

```
【NG】Vercel → WordPress（403 Forbidden by XSERVER）
【OK】ローカルworker.js → WordPress（日本IPなので通る）
```

そのため「WP同期」ボタンの処理フローは以下：

```
Vercel（ボタン押下）
  → Render /api/jobs/sync-wp（BullMQにジョブ登録）
  → Upstash Redis
  → ローカルworker.js（sync_wpジョブ処理）
  → WordPress REST API ✅
  → Supabase DB更新
```

⚠️ **worker.jsが起動していないとWP同期が動かない。**

---

## Upstash Redis 無料枠について

- 無料枠: **50万コマンド（合計）**
- worker.jsを起動しっぱなしにすると消費が速い
- 使い切った場合: Upstashで既存DBを削除 → 新規作成 → `.env`・Renderの`REDIS_URL`を更新

**コマンド節約のため、使わないときはworker.jsを停止すること。**

---

## よくある問題と解決策

| 問題 | 原因 | 解決 |
|------|------|------|
| WP同期が動かない | worker.jsが起動していない | デスクトップ「worker起動」を実行 |
| WP同期 HTTP 403 | XSERVERの海外IPブロック | worker.js経由が正しい仕様（直接呼ばない） |
| Redisエラー "max requests limit" | Upstash無料枠50万超過 | 旧DB削除→新DB作成→REDIS_URL更新 |
| `EADDRINUSE port 3000` | 前のプロセスが残っている | `npx kill-port 3000` |
| Prisma `did not initialize yet` | binaryTargetsが不足 | `webapp/prisma/schema.prisma`のbinaryTargets確認 |
| ACFフィールドが`[]`で返る | REST APIが無効 | WP管理画面→カスタムフィールド→REST APIで表示ON |
| `MODULE_NOT_FOUND` | npm install未実行 | `npm install` |
| jube shubetu 400エラー | `戸建て`をそのまま送っていた | `.replace('戸建て', '戸建')`（修正済み） |
| nurube tenpo 400エラー | 空文字でACF送信していた | matchしない場合は送信しない（修正済み） |

---

## DBスキーマ（主要テーブル）

```
Site
  siteId (PK) / siteName / wpBaseUrl / wpUsername / wpAppPassword / wpPostType

ContentJob
  id / siteId / jobType / status / startedAt / finishedAt / deletedAt / meta

ContentItem
  id / jobId / recordId / title / status / errorMessage

PostResult
  id / itemId / wpPostId / wpPostUrl / postStatus / wpPublishedAt
```

---

## Renderの無料プランの制約

- **15分間アクセスがないとサーバーがスリープ**する
- 最初のリクエストに30〜60秒かかることがある
- スリープ解除後は正常に動く

---

## 残課題

- [ ] nurube 施工事例のタクソノミー自動付与（`properties_category`, `properties_area`等）
- [ ] nurube コラム通しテスト完全確認
- [ ] jube 施工事例の完全動作確認（shubetu/tenpo修正後）
- [ ] Google Sheets連携（現在はtry/catchでスキップ）
- [ ] Upstash有料化検討（月100〜200円。worker常時起動したい場合）
- [ ] WP Application Passwordの期限切れ対策

---

## 開発時の注意

1. **dotenvは`override: true`で読み込む**  
   `require('dotenv').config({ override: true })` ← これがないとClaude Code環境では.envが無視される

2. **webapp（Vercel）はserver.js（Render）にプロキシする設計**  
   DBの読み取りのみPrismaで直接、書き込み系はRender経由

3. **WP投稿はローカルworker.jsからのみ行う**  
   Vercel/Renderから直接叩くとXSERVERにブロックされる
