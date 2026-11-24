@echo off
rem Bigbasket Studio - one command for everything:
rem   docker.bat run                  build and start (default)
rem   docker.bat stop                 stop and remove containers
rem   docker.bat update               git pull, rebuild, migrate, check models vs migrations
rem   docker.bat check                health check of all services
rem   docker.bat makemigration "msg"  generate a migration from model changes
rem   docker.bat createuser [ID] [--superuser] [--role R] [--name N]   create a user and its role
setlocal
cd /d "%~dp0..\.."
set "FRONTEND_PORT=8106"
set "BACKEND_PORT=8107"
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b /r "FRONTEND_PORT= BACKEND_PORT=" .env`) do set "%%a=%%b"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=run"

docker info >nul 2>&1
if errorlevel 1 (
    echo [!] Docker is not running. Start Docker Desktop and try again.
    exit /b 1
)

if /i "%CMD%"=="run" goto run
if /i "%CMD%"=="stop" goto stop
if /i "%CMD%"=="update" goto update
if /i "%CMD%"=="check" goto check
if /i "%CMD%"=="makemigration" goto makemigration
if /i "%CMD%"=="createuser" goto createuser
echo Usage: docker.bat [run^|stop^|update^|check^|makemigration "msg"^|createuser]
exit /b 1

:run
rem Free port 6379 if a standalone redis container is using it
for /f "tokens=*" %%c in ('docker ps -q --filter "publish=6379"') do (
    for /f "tokens=*" %%n in ('docker inspect --format "{{.Name}}" %%c') do (
        if not "%%n"=="/bigbasket_redis" docker stop %%c >nul 2>&1
    )
)
docker compose up --build -d --remove-orphans || exit /b 1
call :verify
goto done

:stop
docker compose down --remove-orphans
exit /b %errorlevel%

:update
git pull --rebase
if errorlevel 1 (
    echo [!] git pull failed. Fix it, then run again.
    exit /b 1
)
docker compose up --build -d --remove-orphans || exit /b 1
call :verify
goto done

:makemigration
if "%~2"=="" (
    echo Usage: docker.bat makemigration "short description"
    exit /b 1
)
docker compose run --rm backend makemigration "%~2"
echo [!] Review the new file in backend\alembic\versions, then run: docker.bat update
exit /b %errorlevel%

:createuser
shift
docker compose run --rm -it backend createuser %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%

:check
docker compose ps
curl -s -m 5 http://localhost:%BACKEND_PORT%/health || echo [FAIL] Backend not responding
echo.
exit /b 0

:verify
docker compose run --rm backend migrate || exit /b 1
docker compose run --rm backend check
if errorlevel 1 echo [!] Models changed without a migration. Run: docker.bat makemigration "what changed"
exit /b 0

:done
echo.
docker compose ps
echo App: http://localhost:%FRONTEND_PORT%   API: http://localhost:%BACKEND_PORT%/docs
exit /b 0
