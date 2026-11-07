@echo off
cd /d "%~dp0.."
if not exist "node_modules\" (
    echo [!] node_modules not found. Running npm install...
    call npm install
)
call npm run dev
if errorlevel 1 (
    echo.
    echo [!] Frontend dev server encountered an error and stopped.
    pause
)
