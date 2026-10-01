#!/bin/bash
# Stops what run_all.sh started: frees the backend/frontend ports (which ends their terminals' processes).

BACKEND_PORT=8107
FRONTEND_PORT=8106

kill_port() {
  local PORT=$1
  local PIDS
  if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -t -i:"$PORT")
  else
    # Git Bash on Windows
    PIDS=$(netstat -ano | awk -v p=":$PORT" '$2 ~ p"$" && $4=="LISTENING" {print $5}' | sort -u)
  fi

  if [ -z "$PIDS" ]; then
    echo "[*] Port $PORT is already free."
    return
  fi

  echo "[*] Port $PORT is in use. Killing process(es): $PIDS..."
  for PID in $PIDS; do
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //F //T //PID "$PID" >/dev/null 2>&1
    else
      kill -9 "$PID" 2>/dev/null
    fi
  done
}

kill_port $BACKEND_PORT
kill_port $FRONTEND_PORT

echo "=========================================="
echo "Servers stopped and ports $BACKEND_PORT / $FRONTEND_PORT are free."
echo "=========================================="
