#!/bin/bash

set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

if [ -f "$BASE_DIR/env/bin/activate" ]; then
  VENV="$BASE_DIR/env/bin/activate"
elif [ -f "$BASE_DIR/env/Scripts/activate" ]; then
  VENV="$BASE_DIR/env/Scripts/activate"
else
  echo "[!] Virtual environment not found at $BASE_DIR/env"
  exit 1
fi

source "$VENV"

# Install/update Python packages from requirements.txt, but only when the file has changed since the
# last successful install (its hash is stored in the venv), so normal launches don't wait on pip.
REQ_FILE="$BASE_DIR/requirements.txt"
REQ_STAMP="$BASE_DIR/env/.requirements.sha256"
if [ -f "$REQ_FILE" ]; then
  REQ_HASH=$(sha256sum "$REQ_FILE" | awk '{print $1}')
  if [ ! -f "$REQ_STAMP" ] || [ "$(cat "$REQ_STAMP")" != "$REQ_HASH" ]; then
    echo "[+] requirements.txt changed - installing Python packages..."
    if python -m pip install -r "$REQ_FILE"; then
      echo "$REQ_HASH" > "$REQ_STAMP"
    else
      echo "[!] pip install -r requirements.txt failed. Fix the error above and run again."
      exit 1
    fi
  else
    echo "[=] Python packages are up to date with requirements.txt."
  fi
fi

kill_port() {
  local PORT=$1
  if command -v lsof >/dev/null 2>&1; then
    local PIDS=$(lsof -t -i:$PORT)
    if [ ! -z "$PIDS" ]; then
      echo "[*] Port $PORT is in use. Killing process(es): $PIDS..."
      kill -9 $PIDS || true
    fi
  elif command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    local PIDS=$(netstat -ano | awk -v p=":$PORT" '$2 ~ p"$" && $4=="LISTENING" {print $5}' | sort -u)
    if [ ! -z "$PIDS" ]; then
      echo "[*] Port $PORT is in use. Killing process(es): $PIDS..."
      for PID in $PIDS; do
        # Best-effort: the PID netstat reports can already be gone (or belong to another
        # session taskkill can't see), which exits non-zero and, under `set -e`, would abort
        # this whole script before uvicorn ever started. Never let cleanup block startup.
        taskkill //PID "$PID" //F >/dev/null 2>&1 || true
      done
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
