# wf-invoice-system

Google Sheets + Apps Script で請求書 PDF を生成するプロジェクトです。

このリポジトリは、**Google OAuth承認だけ手動**、それ以外はスクリプトで進められるようにしています。

## 1. ファイル構成

```text
wf-invoice-system/
  AGENTS.md
  README.md
  appsscript.json
  src/
    constants.gs
    setup.gs
    render.gs
    utils.gs
    ui.gs
    web_api.gs
    test_tools.gs         # テスト用関数（本番運用では不要）
  scripts/
    bootstrap.sh
    seed_test_data.sh
    smoke_test.sh
  ui/
    invoice_form.html      # スプレッドシート用サイドバーUI
    web_app.html           # ブラウザ用管理画面
```

## 2. 先に理解しておくこと（重要）

- 手動が必要な操作
  - `clasp login` の Google ログイン承認
  - Apps Script エディタで `setup()` 実行時の権限承認
- それ以外（create/push/open/seed/smoke）は自動化済み
- スクリプトは冪等性を意識しており、再実行しても壊れにくい作りです

## 3. 初回セットアップ（ほぼ自動）

### A) bootstrap 実行

```bash
cd "/Users/r.a./Documents/01_LAB関連/経理関連/wf-invoice-system"
./scripts/bootstrap.sh
```

`bootstrap.sh` の動作:
- `node` / `npm` / `clasp` の存在チェック
- 未ログインなら `clasp login` を要求して停止（承認待ちで勝手に進めない）
- `.clasp.json` がなければ `clasp create`
- `clasp push`
- `clasp open-script`

もし途中で `STOP` が出たら、承認後にもう一度 `./scripts/bootstrap.sh` を実行してください。

### B) Apps Script で `setup()` 実行（手動承認）

1. `bootstrap.sh` が開いた Apps Script エディタで関数 `setup` を選択
2. 実行
3. 承認画面で許可
4. 承認後、もう一度 `setup()` を実行

`setup()` により以下が作成されます。
- スプレッドシート（SETTINGS / CLIENTS / BANK_ACCOUNTS / DOCS / LINES / ISSUE_LOG）
- Drive フォルダ（templates / output）
- 請求書テンプレ Docs
- `SETTINGS` へ `output_folder_id`, `template_folder_id`, `template_doc_id_invoice` を書き戻し

### C) テストデータ投入（自動）

```bash
./scripts/seed_test_data.sh
```

内部で `clasp run seedTestData_` を実行し、最小テストデータを投入します。

### D) スモークテスト実行（自動）

```bash
./scripts/smoke_test.sh
```

内部で `clasp run smokeTest_` を実行し、以下を検証します。
- `doc_id`（例: `D20260209-0001` 形式）を自動生成
- `renderPdfForDocId(docId)` 実行
- PDF生成
- 成功条件
  - output フォルダに PDF が作成される
  - DOCS の `latest_pdf_url` が埋まる


## 3.5. ブラウザ入力UI（新規）

スプレッドシートを開いてメニュー `帳票` から `請求書作成UIを開く` を選ぶと、
サイドバーで必要情報を入力して `作成してPDF生成` ができます。

- 取引先、発行日、支払期日、件名、備考、明細を入力
- ボタン押下で DOCS/LINES へ自動記録
- そのまま PDF 生成まで実行
- 完了後に `docId` と `pdfUrl` を表示

補足:
- `DOCS.doc_state` は `READY` -> 生成後 `ISSUED` に更新
- `DOCS` シートは `DRAFT/READY/ISSUED` で行色分けされます

## 4. テスト用関数（Apps Script 側）

`src/test_tools.gs` にテスト専用関数を追加しています。

- `seedTestData_()`
  - SETTINGS / CLIENTS / BANK_ACCOUNTS / DOCS / LINES に最小データを upsert
  - 既存キーがあれば更新（重複作成しない）
  - `seal_image_file_id` は空のままでも可
- `smokeTest_()`
  - `seedTestData_()` 呼び出し
  - 当日ベースで `DYYYYMMDD-0001` 形式の `doc_id` を採番
  - レンダリング実行
  - Logger に結果を出力
  - ISSUE_LOG は `renderPdfForDocId` 側の通常ログで記録

注意: これらは **テスト用** であり、本番運用の業務フロー必須ではありません。

## 5. 最小テストデータ（自動投入される内容）

`seedTestData_()` が以下を投入します（キー固定 upsert）。

- SETTINGS（2行目）
  - `issuer_name`: 株式会社テスト商事
  - `default_bank_id`: BANK001
  - `seal_image_file_id`: 空欄（意図的）
- CLIENTS
  - `client_id`: C001
  - `client_name_for_filename`: ウィルフォワード
- BANK_ACCOUNTS
  - `bank_id`: BANK001
- DOCS
  - `doc_id`: DOC-SEED-0001
  - `doc_type`: INVOICE
- LINES
  - 10%課税行 / NON_TAX行 / INFO_ONLY行

## 6. PDF 保存先と命名規則

### 保存先

`SETTINGS` の `output_folder_id` が保存先です。

```text
https://drive.google.com/drive/folders/<output_folder_id>
```

### 命名規則

```text
YYYYMMDD_会社名（CLIENTS.client_name_for_filename）_金額（カンマ）_請求書.pdf
```

例:

```text
20260209_ウィルフォワード_110,000_請求書.pdf
```

同名が存在する場合は旧版を `_OLD_01`, `_OLD_02` ... に退避し、最新をベース名で保存します。

## 7. よくある失敗と復旧

### 7-1. Apps Script API が無効

症状:
- `clasp create` / `clasp push` / `clasp run` で API エラー

対処:
1. Google Cloud Console で対象プロジェクトを開く
2. Apps Script API を有効化
3. 数分待って再実行

### 7-2. 権限不足（Drive/Docs/Sheets）

症状:
- `Authorization is required`
- `You do not have permission`

対処:
1. Apps Script エディタで `setup()` を再実行
2. 承認ダイアログで許可
3. `clasp run seedTestData_` / `clasp run smokeTest_` を再実行

### 7-3. 複数Googleアカウントで承認ミス

症状:
- `clasp login` は通るが、別アカウント側の Drive に作成される

対処:
```bash
clasp logout
clasp login --no-localhost
clasp open-script
```

`clasp login` のアカウントと、Apps Script エディタで承認するアカウントを揃えてください。

## 8. 主要列ヘッダ（コードと一致）

### SETTINGS
`settings_id, issuer_name, issuer_postal, issuer_address, issuer_tel, issuer_email, invoice_reg_no, default_price_mode, default_rounding_mode, default_payment_terms_days, default_bank_id, seal_image_file_id, seal_enabled_default, seal_size_px, output_folder_id, template_folder_id, template_doc_id_invoice, timezone`

### CLIENTS
`client_id, client_name, client_name_for_filename, honorific, postal, address, contact_person, email, tel, preferred_bank_id, default_doc_note, is_active`

### BANK_ACCOUNTS
`bank_id, label, bank_name, branch_name, account_type, account_no, account_name_kana, note, is_default, is_active`

### DOCS
`doc_id, doc_type, client_id, issue_date, due_date, title, note, price_mode, rounding_mode, bank_id, show_bank_info, seal_enabled, info_block_enabled, doc_state, change_reason, revision_no, latest_pdf_file_id, latest_pdf_url, latest_pdf_name, last_rendered_at, total_payable, total_invoice_amount, total_info_only`

### LINES
`line_id, doc_id, line_no, item_name, description, qty, unit, unit_price, amount, line_role, tax_category`

### ISSUE_LOG
`log_id, doc_id, revision_no, action, pdf_file_id, pdf_name, pdf_url, old_pdf_renamed_to, created_at, created_by, change_reason`

## 3.6. ブラウザ管理画面（Webアプリ）

スプレッドシートのサイドバーではなく、別タブのWeb管理画面として運用できます。

### デプロイ手順

1. ローカルをpush

```bash
cd "/Users/r.a./Documents/01_LAB関連/経理関連/wf-invoice-system"
clasp push
```

2. Apps Scriptエディタを開く

```bash
clasp open-script
```

3. Apps Script画面で
- 右上 `デプロイ` -> `新しいデプロイ`
- 種類: `ウェブアプリ`
- 説明: `web dashboard` など
- 実行ユーザー: `自分`
- アクセスできるユーザー: まずは `自分のみ`（運用時に調整）
- `デプロイ` を押して URL を控える

4. URLをブラウザで開く
- 例: `https://script.google.com/macros/s/.../exec`
- 一覧、作成、PDF再生成が使えます

### スプレッドシート側から開く

メニュー `帳票` -> `Web管理画面を開く` でURL案内ダイアログを表示します。

- 初回は Webアプリが未デプロイだとURLが空のため、先に上記デプロイが必要です。

### 現在の対応範囲

- INVOICE: 作成・PDF生成・再生成対応
- QUOTE/RECEIPT 等: 一覧表示のみ（作成UIは今後拡張）

## 3.7. 請求書デザインを更新したい場合

既存の環境でテンプレートだけ更新したい場合は、スプレッドシートのメニューから実行します。

- `帳票` -> `請求書テンプレートを再生成`

これにより `SETTINGS.template_doc_id_invoice` が新しいテンプレートIDに更新され、
以後のPDF生成から新デザインが反映されます。

## 3.8. 多帳票対応（見積書 / 納品書 / 領収書 / 支払明細書）

現在は以下の帳票種別で作成・PDF生成に対応しています。

- QUOTE（見積書）
- INVOICE（請求書）
- DELIVERY_NOTE（納品書）
- RECEIPT（領収書）
- PAYMENT_STATEMENT（支払明細書）

Web管理画面から:
- 新規帳票作成時に「帳票種別」を選択可能
- 既存docを別種別へ変換してPDF生成可能

スプレッドシートメニューから:
- 選択行を見積書/請求書/納品書へ変換可能

## 3.9. 外部Webページで運用する（Apps Scriptエディタ不要）

既存Apps Scriptをバックエンドのまま使い、別Webページから利用できます。

### 3.9.1 事前準備（1回）

1. Apps Script WebアプリURLを用意
- 例: `https://script.google.com/macros/s/XXXX/exec`

2. 最新コードを反映

```bash
cd "/Users/r.a./Documents/01_LAB関連/経理関連/wf-invoice-system"
clasp push --force
```

### 3.9.2 外部Webを起動（ローカル）

```bash
cd "/Users/r.a./Documents/01_LAB関連/経理関連/wf-invoice-system"
export GAS_WEBAPP_URL='https://script.google.com/macros/s/XXXX/exec'
./scripts/run_external_web.sh
```

起動後、`http://localhost:5173` を開きます。

### 3.9.3 できること

- 取引先を使った帳票作成（見積書/請求書/納品書/領収書/支払明細書）
- PDF生成
- 既存帳票を別種別へ変換して生成
- 一覧表示

### 3.9.4 構成

- `external-web/index.html` : 外部UI
- `external-web/main.js` : UIロジック
- `external-web/server.mjs` : GAS APIプロキシ
- `src/web_api.gs` : Apps Script API (`doGet`/`doPost`)

備考:
- 別ドメインのブラウザ直接 `fetch` はCORSで詰まりやすいため、`server.mjs` が中継します。

## 3.10. Vercel / Render 本番デプロイ

### Vercel

1. VercelでこのリポジトリをImport
2. Project設定
- Root Directory: `external-web`
- Environment Variables:
  - `GAS_WEBAPP_URL` = `https://script.google.com/macros/s/XXXX/exec`
3. Deploy
4. 発行URLを開く

補足:
- `/gas` は `external-web/api/gas.js` がApps Scriptへ中継します。
- フロントは `external-web/index.html` / `external-web/main.js` を利用します。

### Render

1. Renderで New -> Blueprint を選択
2. このリポジトリを接続（`render.yaml` を利用）
3. Environment Variable を設定
- `GAS_WEBAPP_URL` = `https://script.google.com/macros/s/XXXX/exec`
4. Deploy

### セキュリティ注意

- Apps Script側のWebアプリ公開範囲は最小化してください（社内運用なら「Googleアカウントを持つ全員」推奨）。
- 外部公開する場合は、別途認証（IP制限/Basic認証/SSO）を前段で追加してください。
