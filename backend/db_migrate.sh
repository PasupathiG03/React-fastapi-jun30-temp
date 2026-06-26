#!/bin/bash

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$BASE_DIR/env/bin/activate"

if [ ! -f "$VENV" ]; then
  echo "[!] Virtual environment not found at $BASE_DIR/env"
  exit 1
fi

source "$VENV"

case "$1" in
  upgrade)
    echo "[+] Applying all pending migrations..."
    alembic upgrade head
    ;;
  downgrade)
    STEPS="${2:--1}"
    echo "[+] Rolling back $STEPS migration(s)..."
    alembic downgrade "$STEPS"
    ;;
  revision)
    MSG="${2:-auto}"
    echo "[+] Generating new migration: $MSG"
    alembic revision --autogenerate -m "$MSG"
    ;;
  current)
    alembic current
    ;;
  history)
    alembic history --verbose
    ;;
  *)
    echo "Usage: $0 {upgrade|downgrade [steps]|revision [message]|current|history}"
    echo ""
    echo "  upgrade              Apply all pending migrations"
    echo "  downgrade [steps]    Roll back (default: -1)"
    echo "  revision [message]   Generate a new autogenerate migration"
    echo "  current              Show current migration version"
    echo "  history              Show full migration history"
    exit 1
    ;;
esac
