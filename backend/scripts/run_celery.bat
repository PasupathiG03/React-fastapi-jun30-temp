@echo off
setlocal

title Celery Worker

echo =======================================================
echo          Pulse Image Studio - Celery Worker
echo =======================================================

cd /d "%~dp0.."

rem 1. Check Python virtual environment
if not exist "env\Scripts\activate.bat" (
    echo [!] Virtual environment not found at backend\env
    pause
    exit /b 1
)

call "env\Scripts\activate.bat"

rem 2. Check Redis status
echo [*] Checking Redis status...
python -c "import redis; r = redis.from_url('redis://localhost:6379/0'); r.ping()" >nul 2>&1
if not errorlevel 1 goto redis_ok

echo [*] Redis not responding on port 6379. Starting Docker container 'local_redis'...
docker start local_redis >nul 2>&1
if errorlevel 1 (
    docker run -d --name local_redis -p 6379:6379 redis:alpine >nul 2>&1
)

python -c "import redis; r = redis.from_url('redis://localhost:6379/0'); r.ping()" >nul 2>&1
if not errorlevel 1 (
    echo [+] Redis container started and healthy on port 6379.
    goto redis_ready
)

echo [!] WARNING: Could not connect to Redis at localhost:6379.
echo [!] Please make sure Docker Desktop is running.
goto redis_ready

:redis_ok
echo [+] Redis is connected and healthy (localhost:6379).

:redis_ready
echo [+] Starting Celery worker (Windows solo pool)...
echo [i] Task queue: tasks.process_batch_task
echo.

rem Run Celery worker with solo pool via python -m celery (avoids Device Guard blocking generated .exe stubs)
python -m celery -A app.core.celery_app worker --loglevel=INFO --pool=solo

if errorlevel 1 (
    echo.
    echo [!] Celery worker stopped or encountered an error.
    pause
)
