#!/bin/bash
set -e

# Detect if running in Docker and map localhost to container service names
if [ -n "$DOCKER_DATABASE_URL" ]; then
    export DATABASE_URL="$DOCKER_DATABASE_URL"
elif [[ "$DATABASE_URL" == *"@localhost:"* ]] || [[ "$DATABASE_URL" == *"@127.0.0.1:"* ]]; then
    # Use the PostgreSQL running on the host machine (your existing database)
    export DATABASE_URL="${DATABASE_URL//@localhost:/@host.docker.internal:}"
    export DATABASE_URL="${DATABASE_URL//@127.0.0.1:/@host.docker.internal:}"
fi

if [ -n "$DOCKER_REDIS_URL" ]; then
    export REDIS_URL="$DOCKER_REDIS_URL"
elif [[ "$REDIS_URL" == *"//localhost:"* ]] || [[ "$REDIS_URL" == *"//127.0.0.1:"* ]]; then
    export REDIS_URL="${REDIS_URL//\/\/localhost:/\/\/redis:}"
    export REDIS_URL="${REDIS_URL//\/\/127.0.0.1:/\/\/redis:}"
fi

if [ -n "$DOCKER_CELERY_BROKER_URL" ]; then
    export CELERY_BROKER_URL="$DOCKER_CELERY_BROKER_URL"
elif [[ "$CELERY_BROKER_URL" == *"//localhost:"* ]] || [[ "$CELERY_BROKER_URL" == *"//127.0.0.1:"* ]]; then
    export CELERY_BROKER_URL="${CELERY_BROKER_URL//\/\/localhost:/\/\/redis:}"
    export CELERY_BROKER_URL="${CELERY_BROKER_URL//\/\/127.0.0.1:/\/\/redis:}"
fi

if [ -n "$DOCKER_CELERY_RESULT_BACKEND" ]; then
    export CELERY_RESULT_BACKEND="$DOCKER_CELERY_RESULT_BACKEND"
elif [[ "$CELERY_RESULT_BACKEND" == *"//localhost:"* ]] || [[ "$CELERY_RESULT_BACKEND" == *"//127.0.0.1:"* ]]; then
    export CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND//\/\/localhost:/\/\/redis:}"
    export CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND//\/\/127.0.0.1:/\/\/redis:}"
fi

# Ensure model cache and AI weights point to the mounted host volume
export MODEL_CACHE="/app/models"
export HF_HOME="/app/models"
export TORCH_HOME="/app/models/torch"

# Add Docker local host to CORS if not present
if [[ "$CORS_ORIGINS" != *"127.0.0.1:${FRONTEND_PORT:-8106}"* ]]; then
    export CORS_ORIGINS="${CORS_ORIGINS},http://127.0.0.1:${FRONTEND_PORT:-8106}"
fi

# 1. Wait for PostgreSQL
echo "[*] Waiting for PostgreSQL database to be reachable..."
python - << 'EOF'
import os, sys, time, re
import psycopg2

db_url = os.getenv("DATABASE_URL", "")
# Convert SQLAlchemy dialect (postgresql+psycopg2://) to standard PostgreSQL DSN for psycopg2
clean_dsn = re.sub(r"^postgresql\+[a-zA-Z0-9_]+://", "postgresql://", db_url)
max_attempts = 45

for i in range(max_attempts):
    try:
        conn = psycopg2.connect(clean_dsn)
        conn.close()
        print("[+] PostgreSQL is ready!")
        sys.exit(0)
    except Exception as e:
        if (i + 1) % 5 == 0:
            print(f"[*] Waiting for PostgreSQL ({i+1}/{max_attempts})...")
        time.sleep(1)

print("[!] Could not connect to PostgreSQL within timeout.")
sys.exit(1)
EOF

# 2. Wait for Redis
echo "[*] Waiting for Redis to be reachable..."
python - << 'EOF'
import os, sys, time, redis

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
max_attempts = 30

for i in range(max_attempts):
    try:
        r = redis.from_url(redis_url, socket_timeout=1)
        if r.ping():
            print("[+] Redis is ready!")
            sys.exit(0)
    except Exception:
        time.sleep(1)

print("[!] Could not connect to Redis within timeout.")
sys.exit(1)
EOF

# 3. Route based on command argument
if [ "$1" = "celery" ]; then
    echo "[+] Starting Celery background worker with concurrency ${CELERY_CONCURRENCY:-4}..."
    exec python -m celery -A app.core.celery_app worker --loglevel=INFO --pool=threads --concurrency="${CELERY_CONCURRENCY:-4}"
elif [ "$1" = "migrate" ]; then
    echo "[+] Running Alembic migrations..."
    exec alembic upgrade head
elif [ "$1" = "createuser" ]; then
    # Interactive: creates a user and its role (e.g. superuser + "Developer" = full access).
    # Runs here, after the DATABASE_URL rewrite above, so it reaches the host's PostgreSQL.
    echo "[+] Applying migrations before creating the user..."
    alembic upgrade head
    shift
    exec python scripts/create_user.py "$@"
elif [ "$1" = "check" ]; then
    # Fails (exit 1) if the models differ from the migrations, i.e. a migration still has to be generated.
    echo "[+] Checking models against migrations..."
    alembic upgrade head
    exec alembic check
elif [ "$1" = "makemigration" ]; then
    # Writes the new file into backend/alembic/versions (mounted from the host).
    echo "[+] Generating migration: ${2:-auto}"
    alembic upgrade head
    exec alembic revision --autogenerate -m "${2:-auto}"
else
    echo "[+] Running Alembic database migrations..."
    alembic upgrade head

    echo "[+] Starting FastAPI server (uvicorn) on 0.0.0.0:${BACKEND_PORT:-8107}..."
    # Auto-reload on code changes only in debug mode (DEBUG=True); production runs without it.
    RELOAD=""
    case "$(echo "${DEBUG:-}" | tr '[:upper:]' '[:lower:]')" in true|1|yes) RELOAD="--reload" ;; esac
    exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT:-8107}" $RELOAD
fi
