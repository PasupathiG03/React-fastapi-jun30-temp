@echo off
set "CELERY_STARTED=1"

echo Starting Redis and Celery Worker in a new terminal...
start "Celery Worker" cmd /k call "%~dp0backend\scripts\run_celery.bat"

echo Starting Backend Server in a new terminal...
start "Backend" cmd /k call "%~dp0backend\scripts\run.bat" dev

echo Starting Frontend Server in a new terminal...
start "Frontend" cmd /k call "%~dp0frontend\scripts\frontend_run.bat"

echo ==========================================
echo Servers and Celery worker have been launched in separate terminal windows.
echo You can close this window now.
echo ==========================================
