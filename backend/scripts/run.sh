#!/bin/bash

set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"
VENV="$BASE_DIR/env/bin/activate"

if [ ! -f "$VENV" ]; then
  echo "[!] Virtual environment not found at $BASE_DIR/env"
  exit 1
fi

source "$VENV"

kill_port() {
  local PORT=$1
  if command -v lsof >/dev/null 2>&1; then
    local PIDS=$(lsof -t -i:$PORT)
    if [ ! -z "$PIDS" ]; then
      echo "[*] Port $PORT is in use. Killing process(es): $PIDS..."
      kill -9 $PIDS
    fi
  fi
}

kill_port 8107

MODE="${1:-dev}"

case "$MODE" in
  dev)
    echo "[+] Starting FastAPI in development mode (auto-reload)..."
    uvicorn app.main:app --host 0.0.0.0 --port 8107 --reload
    ;;
  prod)
    echo "[+] Starting FastAPI in production mode..."
    uvicorn app.main:app --host 0.0.0.0 --port 8107 --workers 4
    ;;
  *)
    echo "Usage: $0 {dev|prod}"
    echo ""
    echo "  dev    Development mode with auto-reload (default)"
    echo "  prod   Production mode with 4 workers"
    exit 1
    ;;
esac
