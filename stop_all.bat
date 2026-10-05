@echo off
rem Stops what run_all.bat started: closes the Backend/Frontend terminals and frees their ports.
set BACKEND_PORT=8107
set FRONTEND_PORT=8106

echo Closing Backend and Frontend terminals...
rem 1. Terminate the cmd.exe terminal windows and their child processes
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'cmd.exe'\" | Where-Object { $_.CommandLine -like '*backend\scripts\run.bat*' -or $_.CommandLine -like '*frontend\scripts\frontend_run.bat*' } | ForEach-Object { taskkill /F /T /PID $_.ProcessId } " >nul 2>&1

rem 2. Also close by window title if available
taskkill /F /T /FI "WINDOWTITLE eq Backend*" >nul 2>&1
taskkill /F /T /FI "WINDOWTITLE eq Frontend*" >nul 2>&1

rem 3. Free ports and terminate any remaining processes
call :kill_port %BACKEND_PORT%
call :kill_port %FRONTEND_PORT%

echo ==========================================
echo Servers stopped, terminals closed, and ports %BACKEND_PORT% / %FRONTEND_PORT% are free.
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
