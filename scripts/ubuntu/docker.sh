#!/bin/bash
# Bigbasket Studio - one command for everything:
#   ./docker.sh run                  build and start (default)
#   ./docker.sh stop                 stop and remove containers
#   ./docker.sh update               git pull, rebuild, migrate, check models vs migrations
#   ./docker.sh check                health check of all services
#   ./docker.sh makemigration "msg"  generate a migration from model changes
set -e
cd "$(cd "$(dirname "$0")/../.." && pwd)"
CMD="${1:-run}"

# Ports come from .env (defaults 8106 / 8107)
get_env() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }
FRONTEND_PORT="$(get_env FRONTEND_PORT)"; FRONTEND_PORT="${FRONTEND_PORT:-8106}"
BACKEND_PORT="$(get_env BACKEND_PORT)"; BACKEND_PORT="${BACKEND_PORT:-8107}"

docker info >/dev/null 2>&1 || { echo "[!] Docker is not running. Try: sudo systemctl start docker"; exit 1; }

verify() {
    docker compose run --rm backend migrate
    docker compose run --rm backend check || echo '[!] Models changed without a migration. Run: ./docker.sh makemigration "what changed"'
}
done_msg() {
    echo; docker compose ps
    echo "App: http://localhost:${FRONTEND_PORT}   API: http://localhost:${BACKEND_PORT}/docs"
}

case "$CMD" in
    run)
        # Free port 6379 if a standalone redis container is using it
        for cid in $(docker ps -q --filter "publish=6379"); do
            [ "$(docker inspect --format '{{.Name}}' "$cid")" != "/bigbasket_redis" ] && docker stop "$cid" >/dev/null || true
        done
        docker compose up --build -d --remove-orphans
        verify; done_msg ;;
    stop)
        docker compose down --remove-orphans ;;
    update)
        git pull --rebase
        docker compose up --build -d --remove-orphans
        verify; done_msg ;;
    check)
        docker compose ps
        curl -s -f -m 5 http://localhost:${BACKEND_PORT}/health || echo "[FAIL] Backend not responding"
        echo ;;
    makemigration)
        [ -n "$2" ] || { echo 'Usage: ./docker.sh makemigration "short description"'; exit 1; }
        docker compose run --rm backend makemigration "$2"
        echo "[!] Review the new file in backend/alembic/versions, then run: ./docker.sh update" ;;
    *)
        echo 'Usage: ./docker.sh [run|stop|update|check|makemigration "msg"]'; exit 1 ;;
esac
