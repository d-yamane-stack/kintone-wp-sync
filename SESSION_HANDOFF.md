# p-write アプリ 引き継ぎ書

> 最終更新: 2026-05-11  
> リポジトリ: https://github.com/d-yamane-stack/kintone-wp-sync  
> 本番URL: https://kintone-wp-sync.vercel.app

---

## 1. アプリ概要

**p-write** — 住宅リフォーム会社向け SEO コンテンツ自動運用ツール。

| ページ | パス | 機能 |
|---|---|---|
| ダッシュボード | `/` | 月次コスト概算・ジョブ実行状況 |
| 施工事例取込 | `/case-study` | Kintone → WordPress 自動投稿 |
| コラム生成 | `/column` | AIでコラム記事を生成 → WP投稿 |
| コラム分析/リライト | `/column-analysis` | GSC+GA4×AIでリライト候補・カテゴリギャップ抽出 |
| ベストコラム | `/best-columns` | 上位10コラムをAIが分析（クリック数順ランキング） |
| SEO順位/競合調査 | `/seo` | Serper.dev で競合サイトのキーワード順位比較 |

**対象サイト**: ハウジング重兵衛 (`jube`) / 塗装屋ぬりべえ (`nurube`)

---

## 2. システム構成

```
┌───────────────────────────────────────────────────────────┐
│  Vercel (Next.js 14 App Router)  webapp/                  │
│  ├─ フロントエンド（React クライアントコンポーネント）          │
│  └─ APIルート (app/api/**/route.js)                        │
│     ├─ Claude API (Anthropic) 直接呼び出し                 │
│     ├─ Google APIs (GSC / GA4) 直接呼び出し                │
│     ├─ Serper.dev 直接呼び出し                             │
│     └─ Kintone API 直接呼び出し                            │
└──────────────────┬────────────────────────────────────────┘
                   │ workerFetch (X-Api-Key認証)
                   ▼
┌───────────────────────────────────────────────────────────┐
│  Worker (server.js) — ローカルPC または Render.com          │
│  - WP REST API 書き込み（XSERVER が Vercel IP をブロック）   │
│  - BullMQ ジョブキュー処理（Supabase Postgres）             │
│  - Claude API 呼び出し（コラム生成・施工事例）               │
└──────────────────┬────────────────────────────────────────┘
                   │ WP App Password (Basic Auth)
                   ▼
┌───────────────────────────────────────────────────────────┐
│  WordPress (XSERVER)  jube.co.jp / nuribe.jp              │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│  Supabase Postgres (DB)                                   │
│  ContentJob / ContentItem / PostResult                    │
│  SeoFetchLog / SeoKeyword / SeoResult                     │
└───────────────────────────────────────────────────────────┘
```

---

## 3. WPからデータを取得する設計方針 ⚠️ 最重要

### 3-1. XSERVER ブロック問題

**Vercel（海外IP）から XSERVER の WordPress に直接アクセスするとブロックされる。**

- **書き込み（POST/PUT/DELETE）**: 必ず `workerFetch` 経由で worker (server.js) に委譲
- **読み取り（GET）**: 同様にブロックの可能性があるため、以下の代替手段を優先する

### 3-2. WPコンテンツ読み取りの優先順位

#### ✅ A. column-sitemap.xml + DB の組み合わせ（最優先・workerなし・常時使用可）

```
column-sitemap.xml → 全コラムURL・lastmod日付
       ↓ URLマッチ
Supabase DB (contentItem) → タイトル・キーワード・公開日
       ↓ URLマッチ
Google Search Console → クリック数・CTR・順位（90日分）
```

実装例: `webapp/app/api/best-columns/analyze/route.js`  
既存API: `GET /api/column-analysis/posts?siteId=jube`（DB + サイトマップ統合済み）

**実装上の注意点:**

```js
// 1. サイトマップの CDATA を除去（jube.co.jp は CDATA 包み）
loc = loc.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();

// 2. URLは trailing-slash × encoded/decoded 全バリアントでマッチング
function urlVariants(url) {
  const set = new Set();
  const add = u => { set.add(u); set.add(u.endsWith('/') ? u.slice(0,-1) : u+'/'); };
  add(url);
  try {
    const u = new URL(url);
    add(u.origin + decodeURIComponent(u.pathname)); // デコード版
    add(u.origin + u.pathname.split('/').map(s =>
      s ? encodeURIComponent(decodeURIComponent(s)) : '').join('/')); // エンコード版
  } catch {}
  return set;
}

// 3. スラグからタイトル fallback（日本語スラグは読める）
function slugFromUrl(url) {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  const raw = segs[segs.length - 1] || '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}
```

**制限**: DB に登録がない古いWP記事（手動作成）はスラグがタイトルになる。  
英字スラグ（例: `sinksita-kabi202108`）は可読性が低い。

#### ⚠️ B. worker 経由 WP REST API（workerが稼働している場合のみ）

```js
import { workerFetch } from '@/lib/workerFetch';
// ページネーション取得（perPage 最大 100）
const res = await workerFetch(`/api/wp/posts?siteId=${siteId}&page=${page}&perPage=100`);
```

**前提条件**: server.js の `.env` に以下が全て設定されていること  
`JUBE_WP_BASE_URL` / `JUBE_WP_USERNAME` / `JUBE_WP_APP_PASSWORD`  
（欠けると `getSiteConfig()` が throw してエラーになる）

**メリット**: 完全タイトル・公開日が確実に取得できる  
**デメリット**: workerの稼働依存、ページネーションで時間がかかる

#### ❌ C. Vercel から WP REST API 直接呼び出し（非推奨）

`fetch('https://jube.co.jp/wp-json/...')` は XSERVER のブロックによりタイムアウトする。

---

## 4. 主要ファイル一覧

### レイアウト・共通
```
webapp/app/layout.js          ← 全体レイアウト（Sidebar + TopBar + main）
webapp/app/Sidebar.js         ← PC用左メニュー（NAVにルートを追加して管理）
webapp/app/TopBar.js          ← ページタイトル・サブタイトル・HeaderStats
webapp/app/BottomNav.js       ← スマホ用下部ナビ（MOBILE_LABELS で短縮名）
webapp/app/HeaderStats.js     ← 月次コスト・$5残高バー（BUDGET_USD 定数）
webapp/app/globals.css        ← 共通CSS（レスポンシブ・カラー変数）
webapp/middleware.js          ← セッション認証（静的ファイルはパス）
```

### ページ
```
webapp/app/page.js                     ← ダッシュボード
webapp/app/case-study/page.js          ← 施工事例取込
webapp/app/column/page.js              ← コラム生成
webapp/app/column-analysis/page.js     ← コラム分析（最大・複雑）
webapp/app/best-columns/page.js        ← ベストコラム TOP10
webapp/app/seo/page.js                 ← SEO順位/競合調査
webapp/app/login/page.js               ← ログイン
```

### API ルート
```
webapp/app/api/auth/login|logout/       ← セッションCookie認証
webapp/app/api/stats/                   ← 月次コスト集計
webapp/app/api/column-analysis/
  posts/       ← DB+サイトマップ コラム一覧（200件上限）
  gsc/         ← GSC 90日データ
  ga4/         ← GA4 ページビュー
  analyze/     ← Claude AI分析（コスト: $0.015/回）
  rewrite/     ← Claude リライト提案（$0.003/回）
  rewrite-execute/ ← Claude リライト実行（$0.008/回）
webapp/app/api/best-columns/
  analyze/     ← ベストコラム分析（サイトマップ+DB+GSC+Claude）
webapp/app/api/seo/
  check/ serp/ comparison/ pdf/ keywords/ ...
webapp/app/api/jobs/
  route.js / [id]/ sync-wp/ retry/
webapp/app/api/kintone/records/
webapp/app/api/sites/
```

### 共通ライブラリ
```
webapp/lib/db.js              ← Prisma クライアント
webapp/lib/siteMeta.js        ← サイトメタ情報（color/name/avatar）
webapp/lib/googleAuth.js      ← Google OAuth2 アクセストークン取得
webapp/lib/workerFetch.js     ← worker(server.js)へのリクエストラッパー
webapp/lib/analysisStore.js   ← コラム分析結果のインメモリキャッシュ（サーバー側）
webapp/lib/useAnalysisStore.js ← React hook（クライアント側）
webapp/prisma/schema.prisma   ← DBスキーマ
```

---

## 5. ページ新規追加手順

新しいページを追加する場合は以下の4ファイルを更新：

```
1. webapp/app/Sidebar.js      → NAV配列にエントリ追加・アイコン定義
2. webapp/app/TopBar.js       → PAGE_TITLES / PAGE_SUBTITLES に追加
3. webapp/app/BottomNav.js    → MOBILE_LABELS に短縮名追加
4. webapp/app/{path}/page.js  → 新規ページファイル作成
```

---

## 6. 課金・コスト集計

### Claude API 単価と集計キー

| 機能 | 単価 | SeoFetchLog.siteId |
|---|---|---|
| コラム生成 | $0.01/件 | ContentJob (jobType='column') |
| 施工事例取込 | $0.04/件 | ContentJob (jobType='case_study') |
| PDFレポート | $0.005/件 | `pdf_*` |
| コラム分析 | $0.015/回 | `ca_analyze_*` |
| リライト提案 | $0.003/回 | `ca_rewrite` |
| リライト実行 | $0.008/回 | `ca_rewrite_exec` |
| ベストコラム | ~$0.01/回 | `ca_best_*` |

### 予算設定
`webapp/app/HeaderStats.js` の `BUDGET_USD = 5.00` を変更。

### Serper.dev
無料枠: 2500件/月。SeoFetchLog で当月分を集計・バー表示。

---

## 7. 環境変数

```env
# Vercel + .env 共通
SESSION_SECRET=
ANTHROPIC_API_KEY=
SERPER_API_KEY=
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
GSC_REFRESH_TOKEN=
GSC_SITE_URL_JUBE=https://jube.co.jp/
GSC_SITE_URL_NURUBE=https://nuribe.jp/
GA4_PROPERTY_ID_JUBE=
GA4_PROPERTY_ID_NURUBE=
WORKER_API_URL=http://localhost:3000
API_SECRET_KEY=
DATABASE_URL=

# Worker (.env のみ・Vercel不要)
JUBE_WP_BASE_URL=https://jube.co.jp
JUBE_WP_USERNAME=
JUBE_WP_APP_PASSWORD=
NURUBE_WP_BASE_URL=https://nuribe.jp
NURUBE_WP_USERNAME=
NURUBE_WP_APP_PASSWORD=
```

---

## 8. このセッションで行った主な変更

| 内容 | 関連ファイル |
|---|---|
| TopBar にサブタイトル統一（全ページ） | TopBar.js |
| ロゴを p-write に差し替え | public/logo.png, login/page.js, Sidebar.js, layout.js |
| middleware で静的ファイルのリダイレクトを修正 | middleware.js |
| スマホ: TopBarサブタイトル非表示 | globals.css |
| スマホ: BottomNav二重アクティブ修正 | BottomNav.js |
| スマホ: BottomNavラベル折り返し防止 | globals.css, BottomNav.js |
| コラム分析セクションD・Eを1列化 | column-analysis/page.js |
| 今月カウントをJST当月に修正 | column-analysis/page.js |
| コラム分析AIのコスト記録・集計追加 | analyze/rewrite/rewrite-execute route.js, stats/route.js |
| HeaderStatsに$5残高バー追加 | HeaderStats.js |
| Google OAuth共通ライブラリ分離 | lib/googleAuth.js |
| **ベストコラム TOP10 新規追加** | best-columns/page.js, api/best-columns/analyze/route.js |
| ARCHITECTURE.md 作成 | ARCHITECTURE.md（リポジトリルート） |

---

## 9. 既知の課題・TODO

| 優先度 | 内容 |
|---|---|
| 中 | ベストコラム: DB未登録の古いWP記事は英字スラグがタイトル表示になる |
| 中 | ベストコラム: `lastmod`は投稿日ではなく最終更新日 |
| 低 | ベストコラム: $5予算がハードコード（設定画面から変更不可） |
| 低 | GSCとサイトマップのURL件数が異なる（サイトマップ=全件, GSC=クリックあり記事のみ） |

---

## 10. ローカル開発・デプロイ

```bash
# フロントエンド
cd webapp && npm install && npm run dev   # http://localhost:3001

# Worker（WP同期・コラム生成が必要な場合）
node server.js   # http://localhost:3000
# 停止: stop-worker.bat

# デプロイ: main ブランチへ push → Vercel 自動デプロイ
```
