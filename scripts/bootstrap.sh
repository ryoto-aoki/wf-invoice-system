#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERROR] '$cmd' が見つかりません。"
    echo "        $hint"
    exit 1
  fi
}

require_cmd node "例: brew install node"
require_cmd npm "Node.js を入れると npm も利用できます。"
require_cmd clasp "例: npm i -g @google/clasp"

echo "[INFO] node: $(node -v)"
echo "[INFO] npm : $(npm -v)"
echo "[INFO] clasp: $(clasp -v)"

if ! clasp login --status >/dev/null 2>&1; then
  echo "[ACTION REQUIRED] clasp に未ログインです。"
  echo "[INFO] これから 'clasp login' を実行します。ブラウザで手動承認してください。"
  clasp login || true
  echo "[STOP] 承認完了後に、もう一度 ./scripts/bootstrap.sh を実行してください。"
  exit 2
fi

if [[ ! -f .clasp.json ]] || ! grep -q '"scriptId"' .clasp.json; then
  echo "[INFO] .clasp.json が未設定のため、新規 Apps Script プロジェクトを作成します。"
  clasp create --type standalone --title "wf-invoice-system"
else
  echo "[INFO] 既存の scriptId を検出したため clasp create はスキップします。"
fi

echo "[INFO] clasp push を実行します。"
clasp push

echo "[INFO] Apps Script エディタを開きます。"
if ! clasp open-script; then
  script_id="$(sed -n 's/.*"scriptId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .clasp.json | head -n1)"
  if [[ -n "$script_id" ]]; then
    echo "[WARN] 自動で開けなかったため、以下URLを手動で開いてください。"
    echo "https://script.google.com/d/${script_id}/edit"
  else
    echo "[WARN] scriptId を取得できませんでした。'cat .clasp.json' で確認してください。"
  fi
fi

echo "[DONE] 次の手順: Apps Script エディタで setup() を実行し、手動承認してください。"
