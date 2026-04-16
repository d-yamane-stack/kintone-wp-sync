# KINTONE → WordPress 自動連携スクリプト

KINTONEの施工事例をClaude APIで推敲し、WordPressに下書き投稿して
Googleスプレッドシートに一覧化する自動連携ツールです。

---

## ファイル構成

```
kintone-wp-sync/
├── index.js          # メインスクリプト（Node.js）
├── gas_webhook.gs    # Google Apps Script（GASに貼り付け）
├── .env              # 環境変数（.env.exampleをコピーして作成）
├── .env.example      # 環境変数テンプレート
└── package.json
```

---

## セットアップ手順

### Step 1: Node.js環境を準備

```bash
# Node.js 18以上が必要（確認）
node -v

# 依存パッケージをインストール
npm install
```

### Step 2: .envファイルを作成

```bash
cp .env.example .env
```

`GOOGLE_SHEET_ID` も必須です（スプレッドシートURLの `/d/<ID>/` 部分）。

### Step 3: KINTONEのAPIトークンを取得

1. KINTONE管理画面 → アプリ207を開く
2. 右上の歯車アイコン → 「APIトークン」
3. 「生成する」ボタンをクリック
4. 権限：「レコード閲覧」「ファイルの読み取り」にチェック
5. 表示されたトークンを `.env` の `KINTONE_API_TOKEN` に設定

### Step 4: WordPressのアプリケーションパスワードを設定

1. WordPress管理画面 → 「ユーザー」→「プロフィール」
2. ページ下部「アプリケーションパスワード」セクション
3. 名前欄に「KINTONE連携」と入力 → 「新しいアプリケーションパスワードを追加」
4. 表示されたパスワード（xxxx xxxx xxxx xxxx形式）をコピー
5. `.env` の `WP_USERNAME` にWordPressユーザー名
6. `.env` の `WP_APP_PASSWORD` に上記パスワード（スペースはそのままでOK）を設定

### Step 5: Google Apps Scriptを設定

1. Googleスプレッドシートを新規作成（タイトル例：「施工事例 下書き管理」）
2. 拡張機能 → Apps Script
3. `gas_webhook.gs` の内容を貼り付けて保存（Ctrl+S）
4. 「デプロイ」→「新しいデプロイ」
5. 種類：「ウェブアプリ」を選択
6. 設定：
   - 説明：「施工事例Webhook」
   - 次のユーザーとして実行：「自分」
   - アクセスできるユーザー：「全員」
7. 「デプロイ」→ Google認証 → WebアプリのURLをコピー
8. `.env` の `GAS_WEBHOOK_URL` に貼り付け

### Step 6: Anthropic APIキーを設定

1. https://console.anthropic.com/ にアクセス
2. 「API Keys」→「Create Key」
3. 生成されたキーを `.env` の `ANTHROPIC_API_KEY` に設定

### Step 7: KINTONEフィールドコードを確認・修正

⚠️ **重要**: `index.js` の `extractRecordData` 関数内のフィールドコードが
実際のKINTONEアプリのフィールドコードと一致していることを確認してください。

KINTONEでフィールドコードを確認する方法：
1. アプリ207 → フォームの設定
2. 各フィールドをクリック → 「フィールドコード」を確認

主な確認対象フィールドコード（index.js 約100行目付近）：
- `施工事例レコード番号`
- `ANDPAD_URL`
- `施工地`
- `施工箇所`
- `物件種別`
- `築年数`
- `リフォーム期間`
- `リフォーム費用（税抜）`
- `施工前の悩み`
- `リフォームのポイント`
- `お客様から一言`
- `メーカー名/品名`
- `施工前写真`
- `施工中写真（おまかせ）`
- `施工後写真`

---

## 実行方法

```bash
# 最新3件を処理（デフォルト）
npm start

# 件数を指定して実行
node index.js 1    # 1件のみ（テスト推奨）
node index.js 5    # 5件
node index.js 10   # 10件

# 対話確認をスキップして実行
node index.js 3 --yes

# レコードIDを指定して1件だけ再実行
node index.js --record-id 1234 --yes
```

失敗したレコードは `failed-records-<timestamp>.json` に保存されます。
`--record-id` 指定時は最新N件の取得ではなく、指定IDをKINTONEへ直接問い合わせます。

### KINTONEフィールドコードを環境変数で上書き（任意）

`index.js` の既定値で合わない場合、以下のように `.env` へ追加すると
KINTONEフィールド名を環境ごとに切り替えられます。

```env
FIELD_TITLE=施工事例UPレコード番号
FIELD_LOCATION=住所
FIELD_AREA=施工箇所
FIELD_TROUBLE=施工主様のお悩み
FIELD_REFORM_POINT=リフォームのポイント
FIELD_BEFORE_IMAGES=施工前の写真
FIELD_DURING_IMAGES=施工中の写真
FIELD_AFTER_IMAGES=施工後の写真
```

---

## GASの動作テスト

GASエディタで `testWebhook` 関数を実行すると
スプレッドシートにテストデータが追加されます。

---

## トラブルシューティング

### KINTONE API エラー
- APIトークンの権限（レコード閲覧・ファイル読み取り）を確認
- アプリIDが207であることを確認

### WordPress 401エラー
- アプリケーションパスワードが正しく設定されているか確認
- WordPressの「REST API」が有効になっているか確認
- セキュリティプラグイン（SiteGuard等）でREST APIがブロックされていないか確認

### WordPress カスタム投稿タイプエラー
- `example` タイプでREST APIが有効になっているか確認
- 投稿タイプ登録時に `show_in_rest => true` が設定されているか開発者に確認

### GAS Webhookが呼ばれない
- GAS_WEBHOOK_URLが正しく設定されているか確認
- GASのデプロイ時に「アクセスできるユーザー：全員」になっているか確認
