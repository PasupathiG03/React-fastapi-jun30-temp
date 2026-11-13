@echo off
setlocal

set "BACKEND_DIR=%~dp0.."
set "VENV_DIR=%BACKEND_DIR%\env"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"

rem 0. Ensure Python 3.10 virtual environment exists at backend\env
if not exist "%VENV_PY%" (
    echo [*] Creating Python 3.10 virtual environment at "%VENV_DIR%"...
    py -3.10 -m venv "%VENV_DIR%" >nul 2>&1
    if errorlevel 1 (
        echo [!] py -3.10 not found, falling back to default python...
        python -m venv "%VENV_DIR%"
        if errorlevel 1 (
            echo [!] Failed to create virtual environment at "%VENV_DIR%".
            pause
            exit /b 1
        )
    )
    echo [*] Installing PyTorch 2.14.1 and backend requirements...
    "%VENV_PY%" -m pip install --upgrade pip
    "%VENV_PY%" -m pip install torch==2.14.1 torchvision
    "%VENV_PY%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
    if errorlevel 1 (
        echo [!] Failed to install requirements.txt.
        pause
        exit /b 1
    )
)

rem 1. Check Redis via Docker (Windows environment)
docker ps | findstr /i "local_redis" >nul 2>&1
if errorlevel 1 (
    echo [*] Redis container 'local_redis' is not running. Starting Docker container...
    docker start local_redis >nul 2>&1
    if errorlevel 1 (
        docker run -d --name local_redis -p 6379:6379 redis:alpine >nul 2>&1
    )
)

rem 2. Ensure Celery background worker terminal is running (check running Celery process)
if defined CELERY_STARTED (
    echo [=] Celery background worker managed by launcher.
) else (
    powershell -NoProfile -Command "if (@(Get-CimInstance Win32_Process -Filter 'Name=''python.exe'' and CommandLine LIKE ''%%celery%%''').Count -gt 0) { exit 0 } else { exit 1 }" >nul 2>&1
    if errorlevel 1 (
        echo [*] Starting Celery background worker terminal...
        start "Celery Worker" cmd /k call "%~dp0run_celery.bat"
    ) else (
        echo [=] Celery background worker is already active.
    )
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
