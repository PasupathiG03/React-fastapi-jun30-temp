@echo off
rem Stops what run_all.bat started: closes the Backend/Frontend terminals and frees their ports.
set BACKEND_PORT=8107
set FRONTEND_PORT=8106

echo Closing Backend and Frontend terminals...
taskkill /F /T /FI "WINDOWTITLE eq Backend*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq Frontend*" >nul 2>&1

call :kill_port %BACKEND_PORT%
call :kill_port %FRONTEND_PORT%

echo ==========================================
echo Servers stopped and ports %BACKEND_PORT% / %FRONTEND_PORT% are free.
echo ==========================================
exit /b 0

:kill_port
set FOUND=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%1 .*LISTENING"') do (
  set FOUND=1
  echo [*] Port %1 is in use. Killing process %%P...
  taskkill /F /T /PID %%P >nul 2>&1
)
if not defined FOUND echo [*] Port %1 is already free.
exit /b 0
