# Claude Code 引き継ぎプロンプト

このファイルを読んだ後、`SPEC.md` も必ず読んでください。

---

## あなたへのお願い

このプロジェクト `kintone-wp-sync` の開発を引き継いでください。
以下を読んで現状を把握し、ユーザーの指示に応えてください。

---

## プロジェクトの一言説明

**Kintone の施工事例データを Claude AI で推敲し WordPress に自動投稿するシステム。**
非エンジニアが使える Next.js 製 Web アプリ（`webapp/`）も含む。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Node.js（ES5スタイル `'use strict'`、Expressなし） |
| キュー | BullMQ + Upstash Redis |
| DB | Prisma v5 + Supabase (PostgreSQL) |
| AI | Anthropic Claude API（`claude-sonnet-4-5`） |
| フロント | Next.js 16 App Router + React 19 + Tailwind CSS v4 |
| WordPress | REST API + ACFプラグイン |

---

## 3プロセス構成（常時起動が必要）

```
node server.js    # port 3000: ジョブ投入API（BullMQへのエンキュー）
node worker.js    # BullMQワーカー（実際の処理実行）
cd webapp && npm run dev  # Next.js webアプリ（port 3001前後）
```

`start.bat` をダブルクリックすれば3つが自動起動。

---

## 重要な設計上の決定事項

### ① webapp は server.js にプロキシする設計
`webapp/app/api/jobs/route.js` は DB に直接書かず、`server.js`（WORKER_API_URL）に転送する。
DB の読み取り（ジョブ一覧）だけ Prisma で直接アクセス。

### ② マルチサイト対応
`sites/siteConfigs.js` の `getSiteConfig(siteId)` が `adminBase`（WP管理画面URL）と `restBase`（REST API URL）を動的に計算する。
`JUBE_WP_ADMIN_BASE_URL` が設定されていないと施工事例のWP編集URLが壊れる。

### ③ processBatch の existingJobId
`processBatch(records, siteConfig, { existingJobId })` で既存ジョブIDを渡すと `createJob` をスキップ。
これがないと server.js と processBatch.js の両方でジョブが作られ2件になる（修正済み）。

### ④ WordPress コラムの投稿タイプ
jube サイトのコラム投稿タイプは `column`（rest_base も `column`）。
`post` や `posts` ではない。

### ⑤ Gutenberg ブロック形式の注意点
H2: `<!-- wp:heading {"className":"is-style-heading"} -->` → クラスは `is-style-heading` のみ（`wp-block-heading` を追加しない）
リスト: `<!-- wp:list {"className":"is-style-ul-style1"} -->` → `wp-block-list` を追加しない

---

## ファイルを触るときの注意

- **`sites/siteConfigs.js`**: サイト追加・変更時はここを編集
- **`ai/prompts/column_jube.js`**: コラム生成プロンプト。JSON形式で返すよう厳密に設計されている
- **`db/schema.prisma`** と **`webapp/prisma/schema.prisma`** は同内容を保つ
- **`.env`** は gitignore 対象。`webapp/.env.local` にも同様の設定が必要
- Node.js バックエンドは `'use strict'` + CommonJS（`require`/`module.exports`）スタイル
- webapp は ESM（`import`/`export`）スタイル

---

## よくある問題と解決策

| 問題 | 原因 | 解決 |
|------|------|------|
| 施工事例のWP編集URLが404 | `.env` の `JUBE_WP_ADMIN_BASE_URL` 未設定 or server/worker未再起動 | `.env` 確認後、server/worker再起動 |
| 施工事例ジョブが2件出る | `processBatch` が `existingJobId` なしで呼ばれている | `worker.js` → `caseStudy.js` → `processBatch` に `dbJobId` を渡す |
| コラム生成でコンテンツが0件 | `runColumnPipeline` に `jobId` が渡っていない | `worker.js` の呼び出しを確認 |
| `bullmq MODULE_NOT_FOUND` | `npm install` 未実行 | `npm install` を実行 |
| Google Sheets でエラー | `credentials.json` 未配置 | try/catch でスキップ済み（無視してよい） |

---

## 今後の課題（未実装）

- コラム記事への画像挿入・自動生成
- タグ自動付与
- Google Sheets 認証情報のセットアップ
- webapp の本番デプロイ（現状は localhost のみ）

---

## 詳細は SPEC.md を参照

アーキテクチャ図・DB スキーマ・各フローの詳細・環境変数一覧は `SPEC.md` に記載。
