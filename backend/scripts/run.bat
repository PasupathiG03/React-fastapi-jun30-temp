@echo off
setlocal

rem 1. Check Redis via Docker (Windows environment)
docker ps | findstr /i "local_redis" >nul 2>&1
if errorlevel 1 (
    echo [*] Redis container 'local_redis' is not running. Starting Docker container...
    docker start local_redis >nul 2>&1
    if errorlevel 1 (
        docker run -d --name local_redis -p 6379:6379 redis:alpine >nul 2>&1
    )
)

rem 2. Ensure Celery background worker terminal is running
tasklist /fi "WINDOWTITLE eq Celery Worker*" 2>nul | findstr /i "Celery" >nul 2>&1
if errorlevel 1 (
    echo [*] Starting Celery background worker terminal...
    start "Celery Worker" cmd /k call "%~dp0run_celery.bat"
)

for /f "delims=" %%G in ('where git 2^>nul') do (
  if not defined GIT_EXE set "GIT_EXE=%%G"
)
if not defined GIT_EXE (
  echo [!] Could not find Git for Windows on PATH. Install it and try again.
  pause
  exit /b 1
)
for %%I in ("%GIT_EXE%") do set "GIT_DIR=%%~dpI"
if exist "%GIT_DIR%..\bin\bash.exe" set "BASH_EXE=%GIT_DIR%..\bin\bash.exe"
if not defined BASH_EXE if exist "%GIT_DIR%..\..\bin\bash.exe" set "BASH_EXE=%GIT_DIR%..\..\bin\bash.exe"
if not defined BASH_EXE if exist "%GIT_DIR%bash.exe" set "BASH_EXE=%GIT_DIR%bash.exe"
if not defined BASH_EXE (
  echo [!] Could not locate bash.exe next to git.exe at "%GIT_DIR%".
  pause
  exit /b 1
)
"%BASH_EXE%" "%~dp0run.sh" %*
if errorlevel 1 (
  echo.
  echo [!] Backend server stopped.
  pause
)
