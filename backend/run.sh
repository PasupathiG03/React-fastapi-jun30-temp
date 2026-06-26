#!/bin/bash

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$BASE_DIR/env/bin/activate"

if [ ! -f "$VENV" ]; then
  echo "[!] Virtual environment not found at $BASE_DIR/env"
  exit 1
fi

source "$VENV"

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
