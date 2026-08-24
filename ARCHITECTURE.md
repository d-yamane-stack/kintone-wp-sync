# kintone-wp-sync アーキテクチャ全体図

> 最終更新: 2026-05-11

---

## 1. システム全体像（プロセス×ホスティング）

```mermaid
flowchart TB
  subgraph Vercel["🌐 Vercel (webapp/)"]
    NextApp["Next.js 16 + React 19<br/>middleware: rw_session認証"]
    NextAPI["Next API Routes<br/>(/api/auth, /api/sites, /api/stats,<br/>/api/column-analysis/*, /api/seo/*)"]
    NextApp --- NextAPI
  end

  subgraph Render["☁ Render (Node)"]
    Server["server.js<br/>HTTP API (X-Api-Key)<br/>port: PORT"]
    Worker["worker.js<br/>5秒ポーリング<br/>node-cron: 1日,15日 9:00"]
  end

  subgraph Supabase["🗄 Supabase Postgres"]
    DB[("Prisma:<br/>ContentJob / ContentItem<br/>PostResult / Site<br/>SeoKeyword / SeoRankRecord<br/>SeoSerpEntry / SeoFetchLog<br/>PromptTemplate")]
  end

  subgraph External["🌍 外部サービス"]
    Kintone["Kintone<br/>(housing-jube.cybozu.com)"]
    WP1["WordPress jube<br/>jube.co.jp/refresh2022"]
    WP2["WordPress nurube<br/>nuribe.jp/refresh2023"]
    Anthropic["Anthropic Claude<br/>(Sonnet 4.5 / Haiku 4.5)"]
    GSC["Google Search Console"]
    GA4["Google Analytics 4"]
    Serper["DataForSEO<br/>(SERP・旧Serper.dev)"]
    Gmail["Gmail SMTP<br/>(通知/PDF送付)"]
  end

  Browser["👤 ブラウザ"] -->|HTTPS| NextApp
  NextAPI -->|workerFetch<br/>X-Api-Key| Server
  NextAPI -->|Prisma直読| DB
  Server -->|Prisma| DB
  Worker -->|Prisma poll| DB
  Server -->|Claude| Anthropic
  NextAPI -->|GSC OAuth| GSC
  NextAPI -->|GA4 OAuth| GA4
  Worker -->|Kintone REST| Kintone
  Worker -->|WP REST + admin-ajax| WP1
  Worker -->|WP REST + admin-ajax| WP2
  Worker -->|Claude| Anthropic
  Worker -->|SERP| Serper
  Worker -->|SMTP| Gmail
  Server -->|admin-ajax sync| WP1
  Server -->|admin-ajax sync| WP2
```

---

## 2. ジョブのライフサイクル（pending → done）

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Next.js (Vercel)
  participant SRV as server.js (Render)
  participant DB as Postgres
  participant WK as worker.js (Render)
  participant AI as Claude
  participant K as Kintone
  participant WP as WordPress

  U->>FE: コラム生成画面で「生成」
  FE->>SRV: POST /api/jobs/column (X-Api-Key)
  SRV->>DB: site.upsert + contentJob.create(status=pending)
  SRV-->>FE: { jobId }
  FE-->>U: 「キューに追加」表示

  loop 5秒ポーリング
    WK->>DB: pickPendingJob()
    DB-->>WK: job (status→running)
  end

  WK->>K: (case_studyの場合) 記事取得
  WK->>AI: prompts/column_jube etc.
  AI-->>WK: title / body / meta
  WK->>WP: media upload + post create (draft)
  WP-->>WK: wpPostId, wpUrl
  WK->>DB: contentItem + postResult 書き込み
  WK->>DB: finishJob(done)
```

---

## 3. ディレクトリ構成（リポジトリレベル）

```mermaid
flowchart LR
  root["kintone-wp-sync/"]
  root --> server["server.js<br/>(HTTP API)"]
  root --> worker["worker.js<br/>(Job Worker)"]
  root --> pipelines["pipelines/"]
  root --> ai["ai/"]
  root --> db["db/"]
  root --> sources["sources/"]
  root --> publishers["publishers/"]
  root --> media["media/"]
  root --> sitesDir["sites/"]
  root --> config["config/"]
  root --> lib["lib/"]
  root --> jobs["jobs/"]
  root --> transformers["transformers/"]
  root --> webapp["webapp/"]

  pipelines --> p1["caseStudy.js"]
  pipelines --> p2["column.js"]
  pipelines --> p3["syncWp.js"]
  pipelines --> p4["seoRank.js"]

  ai --> ai1["claudeClient.js"]
  ai --> ai2["prompts/reform.js"]
  ai --> ai3["prompts/column_jube.js"]
  ai --> ai4["prompts/column_nurube.js"]

  db --> db1["schema.prisma"]
  db --> db2["client.js"]
  db --> db3["repositories/<br/>jobRepo · contentItemRepo<br/>postResultRepo · seoRepo"]

  sources --> s1["kintone.js"]
  publishers --> pub1["wordpress.js"]
  sitesDir --> sc["siteConfigs.js"]
  lib --> lb1["notify.js<br/>pdfReport.js<br/>http.js"]

  webapp --> wa1["app/page.js<br/>(ダッシュボード)"]
  webapp --> wa2["app/column/page.js"]
  webapp --> wa3["app/column-analysis/page.js"]
  webapp --> wa4["app/case-study/page.js"]
  webapp --> wa5["app/seo/page.js"]
  webapp --> wa6["app/login/page.js"]
  webapp --> wa7["app/api/<br/>(auth / jobs / sites /<br/>column-analysis / seo)"]
  webapp --> wa8["lib/<br/>siteMeta · analysisStore ·<br/>workerFetch · db"]
  webapp --> wa9["middleware.js"]
```

---

## 4. DBスキーマ（ER図）

```mermaid
erDiagram
  Site ||--o{ ContentJob : "siteId"
  ContentJob ||--o{ ContentItem : "jobId"
  ContentItem ||--|| PostResult : "1:1"
  Site ||--o{ SeoKeyword : "siteId"
  SeoKeyword ||--o{ SeoRankRecord : ""
  SeoKeyword ||--o{ SeoSerpEntry : ""
  Site ||--o{ SeoCompetitor : ""
  Site ||--|| SeoSiteConfig : ""
  Site ||--o{ SeoFetchLog : ""
  Site ||--o{ PromptTemplate : ""

  Site {
    string siteId PK
    string siteName
    string wpBaseUrl
    string wpUsername
    string wpAppPassword
    string wpPostType
  }
  ContentJob {
    int id PK
    string siteId FK
    string jobType "case_study or column or sync_wp or seo_check"
    string status "pending or running or done or error or done_with_errors"
    json meta
    datetime startedAt
    datetime finishedAt
    datetime deletedAt
    string errorMessage
  }
  ContentItem {
    int id PK
    int jobId FK
    json rawInput
    string generatedTitle
    text generatedBody
    json generatedMeta
    string status
  }
  PostResult {
    int id PK
    int contentItemId FK
    int wpPostId
    string wpUrl
    string wpEditUrl
    string postStatus "publish or draft or future or trash or wp_deleted"
    datetime wpPublishedAt
  }
  SeoKeyword {
    int id PK
    string siteId FK
    string keyword
  }
  SeoRankRecord {
    int id PK
    int keywordId FK
    string domain
    int position
    bool isOwn
    datetime fetchedAt
  }
```

---

## 5. ジョブ種別 × パイプライン × 外部I/O

```mermaid
flowchart LR
  subgraph Jobs["ジョブ種別 (ContentJob.jobType)"]
    JT1["case_study"]
    JT2["column"]
    JT3["sync_wp"]
    JT4["seo_check"]
  end

  subgraph Pipelines["pipelines/"]
    P1["caseStudy.js"]
    P2["column.js"]
    P3["syncWp.js"]
    P4["seoRank.js"]
  end

  JT1 --> P1
  JT2 --> P2
  JT3 --> P3
  JT4 --> P4

  P1 -->|read| K[Kintone]
  P1 -->|rewrite| AI1[Claude Sonnet 4.5]
  P1 -->|draft post| WP[WordPress]

  P2 -->|past titles| WP
  P2 -->|generate| AI2[Claude Haiku 4.5]
  P2 -->|featured image| MEDIA[media/]
  P2 -->|create draft| WP

  P3 -->|status fetch| WPAJAX["/wp-admin/admin-ajax.php<br/>action=rw_sync (WAF回避)"]
  P3 -->|update| DB[(PostResult)]

  P4 -->|SERP| SR[DataForSEO]
  P4 -->|write| DB
  P4 -->|PDF email| MAIL[Gmail SMTP]
```

---

## 6. WordPress 同期：WAF回避ルート

```mermaid
flowchart LR
  subgraph Old["旧ルート (❌ 403 XSERVER WAF)"]
    R1["GET /wp-json/wp/v2/posts"]
  end

  subgraph New["新ルート (✅ admin-ajax)"]
    NA1["POST /wp-admin/admin-ajax.php<br/>action=rw_sync & k=WP_SYNC_KEY & ids=..."]
    NA2["functions.php: rw_sync_handler()<br/>get_posts() → JSON [{id,status,date}]"]
    NA1 --> NA2
  end

  Render["Render: syncWp.js"] -.X.-> R1
  Render --> NA1
```

---

## 7. フロントエンド（Next.js 16）のページマップ

```mermaid
flowchart TB
  Layout["app/layout.js<br/>Sidebar + TopBar + BottomNav"]
  MW["middleware.js<br/>rw_sessionクッキー検証"]

  Layout --> P0["/ ダッシュボード<br/>useAllAnalysisStates<br/>サイト別統計・WP同期ボタン"]
  Layout --> P1["/login<br/>POST /api/auth/login"]
  Layout --> P2["/case-study<br/>Kintoneレコード選択 → ジョブ投入"]
  Layout --> P3["/column<br/>キーワード/トーン/CTA → ジョブ投入<br/>WP同期ボタン・記事一覧"]
  Layout --> P4["/column-analysis<br/>WP×GSC×GA4×Claude<br/>カテゴリ別分析・ドリルダウン<br/>リライト候補抽出"]
  Layout --> P5["/seo<br/>順位トラッカー / 競合 / PDF"]

  P4 --> A1["/api/column-analysis/posts"]
  P4 --> A2["/api/column-analysis/gsc"]
  P4 --> A3["/api/column-analysis/ga4"]
  P4 --> A4["/api/column-analysis/analyze<br/>Claude Haiku"]
  P4 --> A5["/api/column-analysis/rewrite-execute"]
  P0 --> A6["/api/jobs (proxy)"]
  P0 --> A7["/api/jobs/sync-wp"]
  P5 --> A8["/api/seo/* (10+ routes)"]
```

---

## 8. サイト設定（マルチテナント）

```mermaid
flowchart TB
  SC["sites/siteConfigs.js<br/>getSiteConfig(siteId)"]
  SC --> JUBE["jube（ハウジング重兵衛）<br/>━━━━━━━━━━━━━━━━━━<br/>WP: jube.co.jp/refresh2022<br/>postType: example + column<br/>ACF: nayami/point/koe/hiyou等<br/>Repeater: after-main, before-main, zumen<br/>Tax: example_category/area/showroom<br/>Prompt: reform + column_jube<br/>syncKey: WP_SYNC_KEY"]
  SC --> NURUBE["nurube（塗装屋ぬりべえ）<br/>━━━━━━━━━━━━━━━━━━<br/>WP: nuribe.jp/refresh2023<br/>postType: properties<br/>ACF: 簡易 + buzai repeater<br/>（zumenなし、during/under追加）<br/>Prompt: column_nurube<br/>featuredImageOnly + 吹き出しSC"]
  SC --> OTHER["another_site<br/>テンプレート stub"]
```

---

## 9. 認証・通信フロー

```mermaid
flowchart LR
  subgraph Trust["セキュリティ境界"]
    direction TB
    BrowserAuth["ブラウザ<br/>↓ rw_session Cookie (SESSION_SECRET署名)"]
    Vercel["Vercel middleware.js<br/>↓ クッキー検証 (Login以外)"]
    NextRoute["Next.js API Route"]
    Header["X-Api-Key: API_SECRET_KEY"]
    RenderSrv["server.js (Render)<br/>↓ requireApiKey()"]
  end

  BrowserAuth --> Vercel --> NextRoute -->|workerFetch| Header --> RenderSrv

  RenderSrv --> WPAuth["WP: Basic Auth<br/>(Application Password)"]
  RenderSrv --> WPSync["admin-ajax: k=WP_SYNC_KEY"]
  RenderSrv --> KintoneAuth["Kintone: X-Cybozu-API-Token"]
  RenderSrv --> ClaudeAuth["Anthropic: ANTHROPIC_API_KEY"]
  NextRoute --> GoogleAuth["Google: OAuth2 Refresh Token<br/>(GSC+GA4で共有)"]
```

---

## 10. データの流れ（コラム生成→公開→分析）

```mermaid
flowchart TB
  U["👤 ユーザー<br/>キーワード入力"] -->|POST /api/jobs/column| Q[("Postgres<br/>ContentJob.pending")]
  Q -->|5秒poll| WK["worker.js"]
  WK -->|過去タイトル取得| WPGet["WP: 既存記事一覧"]
  WK -->|prompt+context| CL["Claude Haiku 4.5"]
  CL -->|title/body/meta/タグ| WK
  WK -->|画像生成 (media/)| IMG["Featured Image"]
  WK -->|POST + Featured Image| WP["WordPress 下書き"]
  WP -->|wpPostId| WK
  WK --> CI["ContentItem<br/>+ PostResult (draft)"]

  WP -. WP管理画面で公開 .-> WPPub["status: publish"]
  U2["👤 WP同期ボタン"] -->|POST /api/jobs/sync-wp<br/>同期実行| SYNC["syncWp.js<br/>admin-ajax"]
  SYNC -->|status更新| CI

  CI -->|分析画面| ANL["/column-analysis"]
  ANL --> GSC["GSC: 順位/CTR/クリック"]
  ANL --> GA4["GA4: セッション/直帰率"]
  ANL --> CL2["Claude: カテゴリ分類<br/>+ リライト候補"]
  ANL --> UI["UIに表示<br/>カテゴリ別 + ドリルダウン"]
```

---

## ポイント整理（迷ったときの早見表）

| 観点 | 実装 |
|---|---|
| **ジョブキュー** | Redis/BullMQ ではなく **Postgresの `status='pending'` 行**。`worker.js` が5秒ポーリング |
| **シングルワーカー** | `isProcessing` フラグで同時実行1ジョブ。複数Render workerの想定なし |
| **Render側で実行する理由** | XSERVER WAF が Vercel の海外IPを弾く（WP同期・WP REST）。Renderは固定IPが日本寄り |
| **Vercelで実行する理由** | GSC/GA4/Prisma直読・UIホスティング。OAuth Refresh Tokenを安全に保持 |
| **AIプロバイダ** | Anthropic Claudeのみ（OpenAI/Geminiは未使用） |
| **WP状態同期** | `/wp-json/` ❌ → `admin-ajax.php?action=rw_sync` ✅（functions.php に handler 追加が必須） |
| **SEO自動実行** | `node-cron` で毎月1日・15日の9:00（Asia/Tokyo）にSEO順位チェック → PDFメール |
| **prismaクライアント** | 2箇所（`db/schema.prisma` + `webapp/prisma/schema.prisma`）。スキーマ差異に注意 |
| **認証** | Webapp: `rw_session` Cookie（SESSION_SECRET署名） / API: `X-Api-Key` ヘッダ |
| **コラム分析** | Vercel側がGSC/GA4/WP記事を取得 → Claude Haikuでカテゴリ分類・リライト候補抽出 |
| **Kintoneは事例のみ** | Kintone連携は `case_study` ジョブのみ。コラム生成にKintoneは不使用 |
| **今月コラム数** | `buildCategoryStats` が post.date の先頭7文字でYYYY-MM比較してカウント |

---

## 環境変数一覧

| 変数名 | 用途 | 設定場所 |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres (pooled) | Render + Vercel |
| `DIRECT_URL` | Supabase Postgres (direct) | Render + Vercel |
| `API_SECRET_KEY` | Vercel→Render 認証ヘッダ | Render + Vercel |
| `ALLOWED_ORIGIN` | CORS許可オリジン (Vercel URL) | Render |
| `SESSION_SECRET` | rw_session Cookie署名 | Vercel |
| `ANTHROPIC_API_KEY` | Claude API | Render + Vercel |
| `WP_SYNC_KEY` | admin-ajax rw_sync 認証キー | Render |
| `JUBE_KINTONE_API_TOKEN` | Kintone jube | Render |
| `NURUBE_KINTONE_APP_ID` | Kintone nurube AppID (513) | Render |
| `GSC_CLIENT_ID` | Google OAuth クライアントID | Vercel |
| `GSC_CLIENT_SECRET` | Google OAuth クライアントSecret | Vercel |
| `GSC_REFRESH_TOKEN` | Google OAuth RefreshToken | Vercel |
| `GSC_SITE_URL_JUBE` | GSCプロパティURL (jube) | Vercel |
| `GSC_SITE_URL_NURUBE` | GSCプロパティURL (nurube) | Vercel |
| `DATAFORSEO_LOGIN` | DataForSEO SERP API ログイン | Render |
| `DATAFORSEO_PASSWORD` | DataForSEO SERP API パスワード | Render |
| `SERPER_API_KEY` | (旧) Serper.dev SERP API・DataForSEO未設定時のフォールバック | Render |
| `WORKER_API_URL` | Render server.js の URL | Vercel |
| `POLL_INTERVAL_MS` | worker polling間隔 (default 5000) | Render |
