@echo off
setlocal
for /f "delims=" %%G in ('where git 2^>nul') do (
  if not defined GIT_EXE set "GIT_EXE=%%G"
)
if not defined GIT_EXE (
  echo [!] Could not find Git for Windows on PATH. Install it and try again.
  exit /b 1
)
for %%I in ("%GIT_EXE%") do set "GIT_DIR=%%~dpI"
if exist "%GIT_DIR%..\bin\bash.exe" set "BASH_EXE=%GIT_DIR%..\bin\bash.exe"
if not defined BASH_EXE if exist "%GIT_DIR%..\..\bin\bash.exe" set "BASH_EXE=%GIT_DIR%..\..\bin\bash.exe"
if not defined BASH_EXE if exist "%GIT_DIR%bash.exe" set "BASH_EXE=%GIT_DIR%bash.exe"
if not defined BASH_EXE (
  echo [!] Could not locate bash.exe next to git.exe at "%GIT_DIR%".
  exit /b 1
)
"%BASH_EXE%" "%~dp0frontend_run.sh" %*
