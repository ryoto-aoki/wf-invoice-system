#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/external-web"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node が見つかりません。Node.jsをインストールしてください。"
  exit 1
fi

if [ -z "${GAS_WEBAPP_URL:-}" ]; then
  echo "[ERROR] GAS_WEBAPP_URL が未設定です。"
  echo "例:"
  echo "  export GAS_WEBAPP_URL='https://script.google.com/macros/s/xxxx/exec'"
  exit 1
fi

cd "$WEB_DIR"
exec node server.mjs
