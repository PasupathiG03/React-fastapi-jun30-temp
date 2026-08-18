#!/bin/bash
cd "$(dirname "$0")/.."
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

kill_port 8106

npm run dev
