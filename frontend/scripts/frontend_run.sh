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
  elif command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    local PIDS=$(netstat -ano | awk -v p=":$PORT" '$2 ~ p"$" && $4=="LISTENING" {print $5}' | sort -u)
    if [ ! -z "$PIDS" ]; then
      echo "[*] Port $PORT is in use. Killing process(es): $PIDS..."
      for PID in $PIDS; do
        taskkill //PID "$PID" //F >/dev/null 2>&1
      done
    fi
  fi
}

kill_port 8106

npm run dev
