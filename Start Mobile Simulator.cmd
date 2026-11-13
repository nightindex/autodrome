@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\enable-mobile-access.ps1"
if errorlevel 1 (
  echo Mobile access setup did not complete. See the message above.
  pause
  exit /b 1
)

echo Open the Wi-Fi Network URL on your phone. Use http, not https.
call npm run dev:mobile
pause
