# Vercel で帳票管理システムを公開する手順（最短）

## 1. プロジェクトルートへ移動

```bash
cd "/Users/r.a./Documents/01_LAB関連/経理関連/wf-invoice-system"
```

## 2. external-web を GitHub に上げる（未実施なら）

### 2.1 Git を初期化（初回のみ）

```bash
git init
git add .
git commit -m "Initial commit: wf-invoice-system + external-web"
```

### 2.2 GitHub にリポジトリを作成

1. [GitHub](https://github.com/new) で **New repository** をクリック
2. リポジトリ名（例: `wf-invoice-system`）を入力
3. **Create repository** を押す（README 等は追加しなくてOK）

### 2.3 リモートを追加してプッシュ

（以下 `YOUR_USERNAME` と `YOUR_REPO` をあなたの GitHub ユーザー名・リポジトリ名に置き換えてください）

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 3. Vercel で New Project

1. [Vercel](https://vercel.com) にログイン
2. **Add New** → **Project**
3. **Import Git Repository** で、さきほどプッシュしたリポジトリを選択

## 4. プロジェクト設定

| 項目 | 値 |
|------|-----|
| **Root Directory** | `external-web`（右の **Edit** で入力） |
| **Framework Preset** | **Other** |
| **Build Command** | 空欄のまま |
| **Output Directory** | 空欄のまま |

## 5. 環境変数を追加

- **Key**: `GAS_WEBAPP_URL`
- **Value**: あなたの Apps Script Webアプリの URL（`.../exec` で終わるもの）

例: `https://script.google.com/macros/s/XXXXXXXXXX/exec`

（Apps Script エディタ → デプロイ → ウェブアプリの URL をコピー）

## 6. Deploy を実行

**Deploy** ボタンをクリックしてデプロイを開始します。

## 7. 動作確認

デプロイ完了後、表示された **公開URL** を開いて次を確認してください。

- [ ] **帳票一覧**が表示される
- [ ] **新規作成**で PDF が生成できる

---

### 補足

- `/gas` へのリクエストは `external-web/api/gas.js` が Apps Script へ中継します。
- 既存の `vercel.json` でルートや API は設定済みです。
- トラブル時は README の「3.10. Vercel / Render 本番デプロイ」も参照してください。
