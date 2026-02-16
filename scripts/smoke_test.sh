#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v clasp >/dev/null 2>&1; then
  echo "[ERROR] clasp が見つかりません。npm i -g @google/clasp を実行してください。"
  exit 1
fi

if [[ ! -f .clasp.json ]]; then
  echo "[ERROR] .clasp.json がありません。先に ./scripts/bootstrap.sh を実行してください。"
  exit 1
fi

if ! clasp login --status >/dev/null 2>&1; then
  echo "[ACTION REQUIRED] clasp login が必要です。"
  echo "[INFO] clasp login を実行後、再度 ./scripts/smoke_test.sh を実行してください。"
  exit 2
fi

echo "[INFO] smokeTest_() を実行します。"
set +e
OUTPUT="$(clasp run smokeTest_ 2>&1)"
STATUS=$?
set -e
echo "$OUTPUT"

if [[ $STATUS -ne 0 ]] || grep -q "Script function not found" <<<"$OUTPUT"; then
  echo "[ERROR] smokeTest_ の実行に失敗しました。"
  echo "[HINT] Apps Script で API Executable デプロイ作成後に再実行してください。"
  exit 1
fi

echo "[DONE] スモークテストが完了しました。"
