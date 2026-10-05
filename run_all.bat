@echo off
echo Starting Backend Server in a new terminal...
start "Backend" cmd /c call "%~dp0backend\scripts\run.bat" dev

echo Starting Frontend Server in a new terminal...
start "Frontend" cmd /c call "%~dp0frontend\scripts\frontend_run.bat"

echo ==========================================
echo Both servers have been launched in separate terminal windows.
echo You can close this window now.
echo ==========================================
