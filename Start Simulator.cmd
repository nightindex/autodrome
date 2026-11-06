@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
echo Open the Local URL printed below in Chrome or Edge.
call npm run dev
pause
