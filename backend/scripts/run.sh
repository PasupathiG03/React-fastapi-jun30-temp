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

# --- Redis & Celery Background Processing ---
check_and_start_redis() {
  if python -c "import redis; r = redis.from_url('redis://localhost:6379/0'); r.ping()" >/dev/null 2>&1; then
    echo "[+] Redis server is active and reachable on port 6379."
    return 0
  fi

  echo "[*] Redis not reachable on port 6379. Attempting automatic start..."
  # Ubuntu / Debian native service
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start redis 2>/dev/null || true
  elif command -v service >/dev/null 2>&1; then
    sudo service redis-server start 2>/dev/null || true
  fi

  # Docker fallback (Windows / Linux Docker container)
  if command -v docker >/dev/null 2>&1; then
    docker start local_redis 2>/dev/null || docker run -d --name local_redis -p 6379:6379 redis:alpine 2>/dev/null || true
  fi
}

start_celery_worker() {
  # On Windows under Git Bash, celery is launched in its own console window by run.bat
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    return 0
  fi

  # Linux (Ubuntu) native background worker execution
  if pgrep -f "celery -A app.core.celery_app worker" >/dev/null 2>&1; then
    echo "[=] Celery background worker is already active."
    return 0
  fi

  echo "[+] Launching Celery background worker process..."
  celery -A app.core.celery_app worker --loglevel=INFO > "$BASE_DIR/celery.log" 2>&1 &
  CELERY_PID=$!
  echo "$CELERY_PID" > "$BASE_DIR/.celery.pid"
  echo "[+] Celery worker running in background (PID: $CELERY_PID)."
}

cleanup() {
  if [ -f "$BASE_DIR/.celery.pid" ]; then
    local CPID=$(cat "$BASE_DIR/.celery.pid")
    if kill -0 "$CPID" 2>/dev/null; then
      echo "[*] Stopping Celery background worker (PID: $CPID)..."
      kill "$CPID" 2>/dev/null || true
    fi
    rm -f "$BASE_DIR/.celery.pid"
  fi
}
trap cleanup EXIT INT TERM

check_and_start_redis
start_celery_worker

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
